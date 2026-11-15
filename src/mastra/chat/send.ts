import type { KnownBlock } from '@slack/web-api';
import { send as config } from '../config';
import { logger } from '../lib/logger';
import { slackError } from '../lib/slack-error';
import { slack } from './client';

const refusals: Record<string, string> = {
  channel_not_found:
    "I can't see that channel. Invite me first, then ask again.",
  is_archived: 'That channel is archived.',
  restricted_action: "I'm not allowed to post in that channel.",
  restricted_action_read_only_channel:
    "I'm not allowed to post in that channel.",
  ekm_access_denied: "I'm not allowed to post in that channel.",
};

function refusal(error: unknown): Error {
  const text = refusals[slackError(error) ?? ''];
  return new Error(text ?? 'Slack refused the message, so nothing was sent.', {
    cause: error,
  });
}

async function isChannelMember({
  channel,
  userId,
}: {
  channel: string;
  userId: string;
}): Promise<boolean> {
  let cursor: string | undefined;
  for (let page = 0; page < config.maxMemberPages; page++) {
    // biome-ignore lint/performance/noAwaitInLoops: each page needs the previous cursor
    const response = await slack.webClient.conversations.members({
      channel,
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    if (response.members?.includes(userId)) {
      return true;
    }
    cursor = response.response_metadata?.next_cursor;
    if (!cursor) {
      return false;
    }
  }
  return false;
}

export async function assertCanSendTo({
  channel,
  currentChannelId,
  requesterId,
}: {
  channel: string;
  currentChannelId?: string;
  requesterId: string;
}): Promise<void> {
  const info = await slack.webClient.conversations
    .info({ channel })
    .catch((error: unknown) => {
      throw refusal(error);
    });
  const details = info.channel;
  if (details?.is_archived) {
    throw new Error('That channel is archived.');
  }
  if (details?.is_ext_shared) {
    throw new Error(
      "That channel is shared with another organization, so I won't post there for someone."
    );
  }
  if (details?.is_im || details?.is_mpim) {
    if (channel === currentChannelId) {
      return;
    }
    throw new Error('To message someone directly, use their user id.');
  }
  if (details?.is_private) {
    if (!details.is_member) {
      throw new Error(
        "I'm not in that private channel. Someone has to invite me first."
      );
    }
    if (!(await isChannelMember({ channel, userId: requesterId }))) {
      throw new Error(
        "That person isn't a member of that private channel, so I can't post there for them."
      );
    }
  }
}

export async function deliver({
  avatarUrl,
  channel,
  message,
  requesterId,
  threadTs,
  username,
}: {
  avatarUrl?: string;
  channel: string;
  message: string;
  requesterId: string;
  threadTs?: string;
  username: string;
}): Promise<string | undefined> {
  const blocks: KnownBlock[] = [
    { type: 'markdown', text: message },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `Sent by <@${requesterId}> via gorkie` },
      ],
    },
  ];
  const post = () =>
    slack.webClient.chat.postMessage({
      channel,
      ...(threadTs ? { thread_ts: threadTs } : {}),
      text: message,
      blocks,
      username,
      unfurl_links: false,
      ...(avatarUrl ? { icon_url: avatarUrl } : {}),
    });
  const sent = await post()
    .catch(async (error: unknown) => {
      if (slackError(error) !== 'not_in_channel') {
        throw error;
      }
      await slack.webClient.conversations.join({ channel });
      return post();
    })
    .catch((error: unknown) => {
      logger.warn('[send] delivery failed', { error, channel });
      throw refusal(error);
    });
  if (!sent.ts) {
    return;
  }
  const link = await slack.webClient.chat
    .getPermalink({ channel, message_ts: sent.ts })
    .catch(() => undefined);
  return link?.permalink;
}
