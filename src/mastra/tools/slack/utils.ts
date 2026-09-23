import type { Message } from 'chat';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { chat } from '../../chat/instance';
import type { Target } from '../../chat/target';
import { chatChannelId, parseSlackId, rawId, threadIdOf } from '../../lib/ids';
import { logger } from '../../lib/logger';
import type { ChannelContext } from '../../types';

export async function assertReadableChannel({
  channelId,
  currentThreadId,
}: {
  channelId: string;
  currentThreadId?: string;
}) {
  const id = chatChannelId(channelId);
  const metadata = await chat().channel(id).fetchMetadata();
  if (currentThreadId && id === chatChannelId(currentThreadId)) {
    return metadata;
  }

  if (metadata.channelVisibility === 'workspace') {
    return metadata;
  }

  throw new Error(
    'Reading DMs, private channels, or external conversations is not allowed.'
  );
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

  const destination =
    target.type === 'thread'
      ? slack.decodeThreadId(target.id).channel
      : target.id;
  if (rawId(destination) !== rawId(ctx.channelId)) {
    throw new Error(
      'gorkie can only post into the channel this conversation is already in, not another channel. Ask someone in that channel to post there instead.'
    );
  }
}

const joinedChannels = new Set<string>();
const slackErrorSchema = z.looseObject({
  data: z.looseObject({ error: z.string().optional() }).optional(),
});

export async function joinChannel(channelId: string): Promise<void> {
  const id = rawId(channelId);
  if (joinedChannels.has(id)) {
    return;
  }
  try {
    await slack.webClient.conversations.join({ channel: id });
    joinedChannels.add(id);
  } catch (error) {
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
