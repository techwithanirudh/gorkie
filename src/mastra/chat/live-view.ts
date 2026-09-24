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
}

const cards = new Map<string, LiveCard>();

browser.onConnected((threadId) => startLiveView({ threadId }));

function liveBlocks({
  threadId,
  url,
}: {
  threadId: string;
  url: string | null;
}) {
  const ticket = signLiveViewTicket({ threadId });
  const page = `${env.PUBLIC_BASE_URL}/live/${ticket}`;
  const where = url && url !== 'about:blank' ? url : 'a new tab';
  return [
    {
      type: 'video',
      title: { type: 'plain_text', text: 'gorkie is browsing' },
      alt_text: `Live view of gorkie's browser on ${where}`,
      video_url: page,
      // Slack caches thumbnails by URL, so a fresh query shows each refresh.
      thumbnail_url: `${page}/thumb.jpg?v=${Date.now()}`,
      title_url: page,
      provider_name: 'gorkie',
      description: { type: 'plain_text', text: where.slice(0, 200) },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Watch live' },
          url: page,
        },
      ],
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
  // The URL is only the card's caption, so the card still updates without it.
  const url = await browser.getCurrentUrl(threadId).catch(() => null);
  await slack.webClient.chat.update({
    channel: card.channel,
    ts: card.ts,
    text: 'gorkie is browsing',
    blocks: liveBlocks({ threadId, url }),
  });
}

async function startLiveView({
  threadId,
}: {
  threadId: string;
}): Promise<void> {
  if (!env.PUBLIC_BASE_URL || cards.has(threadId)) {
    return;
  }
  const { channel, threadTs } = slack.decodeThreadId(threadId);
  // The URL is only the card's caption, so the card still posts without it.
  const url = await browser.getCurrentUrl(threadId).catch(() => null);
  const posted = await slack.webClient.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: 'gorkie is browsing',
    blocks: liveBlocks({ threadId, url }),
    unfurl_links: false,
  });
  if (!posted.ts) {
    return;
  }
  const timer = setInterval(() => {
    refresh(threadId).catch((error: unknown) => {
      logger.debug('[live-view] refresh failed', { error, threadId });
    });
  }, config.refreshMs);
  // A live card must never keep the process alive on its own.
  timer.unref();
  cards.set(threadId, { channel, timer, ts: posted.ts });
}

export async function endLiveView({
  threadId,
}: {
  threadId: string;
}): Promise<void> {
  const card = cards.get(threadId);
  cards.delete(threadId);
  await browser.closeThreadSession(threadId).catch((error: unknown) => {
    logger.debug('[live-view] failed to close the browser session', {
      error,
      threadId,
    });
  });
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
