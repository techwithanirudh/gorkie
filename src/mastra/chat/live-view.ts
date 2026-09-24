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
  const url = await browser.getCurrentUrl(threadId).catch(() => null);
  const ticket = signLiveViewTicket({ threadId });
  const page = `${env.PUBLIC_BASE_URL}/live/${ticket}`;
  const where = url && url !== 'about:blank' ? url : 'a new tab';
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

export function registerLiveView(): void {
  browser.onSession({
    connected: (threadId) => startLiveView({ threadId }),
    closed: (threadId) => endLiveView({ threadId }),
  });
}
