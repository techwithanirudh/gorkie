import { env } from '@/env';
import { liveView as config } from '../config';
import { signLiveViewTicket } from '../lib/crypto';
import { logger } from '../lib/logger';
import { browser } from '../workspace';
import { slack } from './client';

interface LiveCard {
  channel: string;
  timer: NodeJS.Timeout;
  ts: string;
  video: boolean;
}

const cards = new Map<string, LiveCard>();

async function liveBlocks({
  threadId,
  video,
}: {
  threadId: string;
  video: boolean;
}) {
  // TODO(slopradar): CODING_STANDARDS: no defensive checks for impossible states | getCurrentUrl only reads context.pages() and page.url() (browser-viewer dist/index.js:643, and the override in workspace/browser.ts), it has no throwing path, so this silent catch guards nothing | drop the .catch
  const url = await browser.getCurrentUrl(threadId).catch(() => null);
  // TODO(slopradar): review: correctness | a fresh ticket per call means every 15s refresh changes video_url/title_url, which likely re-renders Slack's video block and drops an open player (unverified against a live client) | sign once in startLiveView, keep it on LiveCard, pass it in; see the refresh note below
  const ticket = signLiveViewTicket({ threadId });
  const page = `${env.PUBLIC_BASE_URL}/live/${ticket}`;
  const where = url && url !== 'about:blank' ? url : 'a new tab';
  // TODO(slopradar): review: correctness | Slack caps alt_text at 2000 chars, so a long page URL (tracking params, data: URLs) makes the video post and the image fallback both fail, and no card is posted | slice `where` once before it is used here and in description
  const alt = `Live view of gorkie's browser on ${where}`;
  // Slack caches thumbnails by URL, so a fresh query shows each refresh.
  const thumbnail = `${page}/thumb.jpg?v=${Date.now()}`;
  return [
    video
      ? {
          type: 'video',
          title: { type: 'plain_text', text: 'gorkie is browsing' },
          alt_text: alt,
          video_url: page,
          thumbnail_url: thumbnail,
          title_url: page,
          provider_name: 'gorkie',
          description: { type: 'plain_text', text: where.slice(0, 200) },
        }
      : {
          type: 'image',
          title: { type: 'plain_text', text: 'gorkie is browsing' },
          alt_text: alt,
          image_url: thumbnail,
        },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          // TODO(slopradar): review: correctness | the copy is false twice over: refresh re-signs every 15s so the card link never expires while the session lives, and an already-open viewer is never cut at 10 min because the ticket is only checked on the WebSocket upgrade (index.ts middleware); 10 min also silently mirrors @mastra/factory STATE_MAX_AGE_MS | say "view only" and let the "session ended" update mark the end
          text: 'view only · this link expires in 10 minutes',
        },
      ],
    },
  ];
}

async function refresh(threadId: string): Promise<void> {
  const card = cards.get(threadId);
  if (!card) {
    return;
  }
  // TODO(slopradar): review: correctness | race: a tick in flight (liveBlocks awaits, chat.update retries up to 5x with a 15s timeout) can land after endLiveView's "session ended" update and resurrect a "browsing" card with dead links forever; setInterval also stacks overlapping ticks | after building blocks, bail unless cards.get(threadId) === card, and chain ticks with setTimeout instead of setInterval
  await slack.webClient.chat.update({
    channel: card.channel,
    ts: card.ts,
    text: 'gorkie is browsing',
    blocks: await liveBlocks({ threadId, video: card.video }),
  });
}

async function startLiveView({
  threadId,
}: {
  threadId: string;
}): Promise<void> {
  // TODO(slopradar): review: correctness | check-then-act across awaits: cards.set happens only after postMessage resolves, so two concurrent `connected` calls (see the connectThread race in workspace/browser.ts) both post a card and the first card's timer leaks | fix at the source with an in-flight connect map in SandboxBrowser, or reserve the map slot before the first await
  if (cards.has(threadId)) {
    return;
  }
  if (!env.PUBLIC_BASE_URL) {
    logger.warn('[live-view] PUBLIC_BASE_URL is unset, no live view posted', {
      threadId,
    });
    return;
  }
  const { channel, threadTs } = slack.decodeThreadId(threadId);
  const post = async (video: boolean) =>
    slack.webClient.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: 'gorkie is browsing',
      blocks: await liveBlocks({ threadId, video }),
      unfurl_links: false,
    });
  let video = true;
  // Slack rejects a video block whose host is not in the app's unfurl domains,
  // which a fresh quick tunnel never is, so fall back to the still thumbnail.
  // TODO(slopradar): review: correctness | every failure (rate limit, not_in_channel, timeout) is read as "video host not in unfurl domains" and triggers a second post that fails the same way | fall back only on Slack's invalid_blocks error code, rethrow the rest
  const posted = await post(true).catch((error: unknown) => {
    logger.warn('[live-view] video block rejected, posting the thumbnail', {
      error,
      threadId,
    });
    video = false;
    return post(false);
  });
  if (!posted.ts) {
    return;
  }
  // TODO(slopradar): review: correctness | for a video card this refresh is what cuts the live view: each chat.update swaps video_url for a fresh ticket URL, and the player itself already streams live over the WebSocket, so the refresh buys nothing but a stale poster | refresh only image (fallback) cards; for video cards keep one ticket for the card's life and do not update until endLiveView (see report)
  const timer = setInterval(() => {
    refresh(threadId).catch((error: unknown) => {
      logger.debug('[live-view] refresh failed', { error, threadId });
    });
  }, config.refreshMs);
  timer.unref();
  cards.set(threadId, { channel, timer, ts: posted.ts, video });
}

async function endLiveView({ threadId }: { threadId: string }): Promise<void> {
  const card = cards.get(threadId);
  cards.delete(threadId);
  if (!card) {
    return;
  }
  clearInterval(card.timer);
  await slack.webClient.chat
    .update({
      channel: card.channel,
      ts: card.ts,
      text: 'Browser session ended',
      blocks: [
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: 'browser session ended' }],
        },
      ],
    })
    .catch((error: unknown) => {
      logger.debug('[live-view] failed to end the card', { error, threadId });
    });
}

// TODO(slopradar): AGENTS: prefer the library contract | `closed` only fires from the SandboxBrowser.closeThreadSession override; a disconnect (sandbox paused or killed, CloakServe crash, edge drop) goes through browser-viewer handleBrowserDisconnected -> core notifyBrowserClosed(threadId) and never reaches it, so the card and its 15s timer live forever and cards.has blocks every later card for the thread | in startLiveView register core's per-thread `browser.onBrowserClosed(() => endLiveView({ threadId }), threadId)` (core dist/browser/index.js:1001, fired by both closeThreadSession and disconnect) and delete the `closed` half of BrowserSessionHooks
export function registerLiveView(): void {
  browser.onSession({
    connected: (threadId) => startLiveView({ threadId }),
    closed: (threadId) => endLiveView({ threadId }),
  });
}
