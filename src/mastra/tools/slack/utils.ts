import type { Message } from 'chat';
import { z } from 'zod';
import { env } from '@/env';
import { slack } from '../../chat/client';
import { chat } from '../../chat/instance';
import type { Target } from '../../chat/target';
import { chatChannelId, parseSlackId, rawId, threadIdOf } from '../../lib/ids';
import { logger } from '../../lib/logger';
import type { ChannelContext } from '../../types';

const slackErrorSchema = z.looseObject({
  data: z.looseObject({ error: z.string().optional() }).optional(),
});
const notReadable =
  'Reading DMs, private channels, or external conversations is not allowed.';

export async function assertReadableChannel({
  channelId,
  currentThreadId,
}: {
  channelId: string;
  currentThreadId?: string;
}) {
  const id = chatChannelId(channelId);
  if (env.BLOCKED_CHANNELS.includes(rawId(id))) {
    throw new Error(notReadable);
  }
  const metadata = await chat().channel(id).fetchMetadata();
  if (currentThreadId && id === chatChannelId(currentThreadId)) {
    return metadata;
  }

  if (metadata.channelVisibility === 'workspace') {
    return metadata;
  }

  throw new Error(notReadable);
}

export async function assertReadableResource({
  channelIds,
  currentThreadId,
}: {
  channelIds: string[];
  currentThreadId?: string;
}): Promise<void> {
  if (channelIds.length === 0) {
    throw new Error('This Slack resource is not associated with a channel.');
  }

  const checks = await Promise.allSettled(
    channelIds.map((channelId) =>
      assertReadableChannel({ channelId, currentThreadId })
    )
  );
  if (checks.some((check) => check.status === 'fulfilled')) {
    return;
  }

  // Still refused either way. A rate limit or timeout just must not read as
  // "this conversation is private".
  const failed = checks.find(
    (check) =>
      check.status === 'rejected' &&
      check.reason?.message !== notReadable &&
      slackErrorSchema.safeParse(check.reason).data?.data?.error !==
        'channel_not_found'
  );
  if (failed?.status === 'rejected') {
    throw new Error(
      'Could not check whether this Slack resource is readable, so it was not opened. This says nothing about whether it is private. Retry before concluding anything.',
      { cause: failed.reason }
    );
  }

  throw new Error(
    'Reading or editing Slack resources from another private conversation is not allowed.'
  );
}

export function assertCanPostTo({
  target,
  ctx,
}: {
  target: Target;
  ctx: ChannelContext;
}): void {
  if (target.type === 'user') {
    if (!ctx.userId || rawId(target.id) !== rawId(ctx.userId)) {
      throw new Error(
        'gorkie can only DM the person currently asking, not a third party on their behalf. Ask that person to message gorkie directly instead.'
      );
    }
    return;
  }

  if (!ctx.channelId) {
    throw new Error('No current Slack channel to compare against.');
  }

  // parseSlackId is what the tools post with, so a permalink inside a thread id
  // cannot pass this check and then post somewhere else.
  const destination =
    target.type === 'thread'
      ? (parseSlackId(target.id).channel ?? '')
      : target.id;
  if (rawId(destination) !== rawId(ctx.channelId)) {
    throw new Error(
      'gorkie can only post into the channel this conversation is already in, not another channel. Ask someone in that channel to post there instead.'
    );
  }
}

const joinedChannels = new Set<string>();

export async function joinChannel(channelId: string): Promise<void> {
  const id = rawId(channelId);
  if (joinedChannels.has(id)) {
    return;
  }
  try {
    await slack.webClient.conversations.join({ channel: id });
    joinedChannels.add(id);
  } catch (error) {
    // already_in_channel means the bot is already a member, the state we want,
    // so remember it and stop re-calling join. Other failures may be transient,
    // so do not cache and let a later call retry.
    if (
      slackErrorSchema.safeParse(error).data?.data?.error ===
      'already_in_channel'
    ) {
      joinedChannels.add(id);
      return;
    }
    logger.debug('[slack] could not join the channel', { channelId, error });
  }
}

export function slackThreadId({
  channelId,
  threadId,
}: {
  channelId?: string;
  threadId: string;
}): string {
  return threadIdOf(parseSlackId(threadId, { channel: channelId })) ?? threadId;
}

export function formatMessage(message: Message) {
  return {
    id: message.id,
    threadId: message.threadId,
    text: message.text,
    author: {
      userId: message.author.userId,
      userName: message.author.userName,
      fullName: message.author.fullName,
      isBot: message.author.isBot,
      isMe: message.author.isMe,
    },
    dateSent: message.metadata.dateSent.toISOString(),
    edited: message.metadata.edited,
    isMention: message.isMention,
    attachments: message.attachments.map((a) => ({
      type: a.type,
      name: a.name,
      mimeType: a.mimeType,
      url: a.url,
    })),
  };
}

// A remote file's url_private can be any host, and must never get a Slack token.
export function assertSlackFileHost(url: string): void {
  const { hostname, protocol } = new URL(url);
  if (
    protocol !== 'https:' ||
    !(hostname === 'slack.com' || hostname.endsWith('.slack.com'))
  ) {
    throw new Error('That file is hosted outside Slack, so it cannot be read.');
  }
}
