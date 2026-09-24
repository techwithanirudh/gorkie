import type { RequestContext } from '@mastra/core/request-context';
import type { Message } from 'chat';
import { Chat } from 'chat';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { chatChannelId, parseSlackId, rawId, threadIdOf } from '../../lib/ids';
import { logger } from '../../lib/logger';
import { ALREADY_IN_CHANNEL } from '../../lib/logger/slack';
import type { ChannelContext } from '../../types';
import { slackErrorSchema, type Target } from '../../types/tools/index';

export async function assertReadableChannel({
  channelId,
  currentThreadId,
}: {
  channelId: string;
  currentThreadId?: string;
}) {
  const id = chatChannelId(channelId);
  const metadata = await Chat.getSingleton().channel(id).fetchMetadata();
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

export async function readableFile({
  fileId,
  requestContext,
}: {
  fileId: string;
  requestContext: RequestContext;
}) {
  const { file } = await slack.webClient.files.info({ file: fileId });
  const channelIds = [
    ...(file?.channels ?? []),
    ...(file?.groups ?? []),
    ...(file?.ims ?? []),
  ];
  if (channelIds.length === 0) {
    throw new Error('This Slack resource is not associated with a channel.');
  }

  const { threadId } = channelContext(requestContext);
  const checks = await Promise.allSettled(
    channelIds.map((channelId) =>
      assertReadableChannel({ channelId, currentThreadId: threadId })
    )
  );
  if (!checks.some((check) => check.status === 'fulfilled')) {
    throw new Error(
      'Reading or editing Slack resources from another private conversation is not allowed.'
    );
  }
  return { file, channelIds };
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

export async function slackDestination(
  target: Target
): Promise<{ channel: string; threadTs?: string }> {
  if (target.type === 'channel') {
    return { channel: rawId(target.id) };
  }
  if (target.type === 'user') {
    return {
      channel: rawId((await Chat.getSingleton().openDM(rawId(target.id))).id),
    };
  }
  // Decode exactly as assertCanPostTo does: a lenient parser here could read a
  // different channel out of the same id than the one the gate approved.
  const { channel, threadTs } = slack.decodeThreadId(target.id);
  return { channel, threadTs: threadTs || undefined };
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
    if (
      slackErrorSchema.safeParse(error).data?.data?.error === ALREADY_IN_CHANNEL
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
  return (
    threadIdOf(parseSlackId({ channel: channelId, input: threadId })) ??
    threadId
  );
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
