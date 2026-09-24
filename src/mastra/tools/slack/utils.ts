import { fetchSlackFile } from '@chat-adapter/slack/api';
import type { RequestContext } from '@mastra/core/request-context';
import type { Message } from 'chat';
import { Chat } from 'chat';
import { env } from '@/env';
import { slack } from '../../chat/client';
import { focusFilter } from '../../chat/focus';
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

export async function readableChannelIds({
  channelIds,
  currentThreadId,
}: {
  channelIds: string[];
  currentThreadId?: string;
}): Promise<Set<string>> {
  const maxConcurrentVisibilityLookups = 4;
  const readable = new Set<string>();
  for (
    let index = 0;
    index < channelIds.length;
    index += maxConcurrentVisibilityLookups
  ) {
    const batch = channelIds.slice(
      index,
      index + maxConcurrentVisibilityLookups
    );
    // biome-ignore lint/performance/noAwaitInLoops: batches are sequential on purpose - that is what bounds the concurrency.
    const checks = await Promise.allSettled(
      batch.map((channelId) =>
        assertReadableChannel({ channelId, currentThreadId })
      )
    );
    checks.forEach((check, i) => {
      if (check.status === 'fulfilled') {
        readable.add(batch[i]);
      }
    });
  }
  return readable;
}

export async function readableFile({
  fileId,
  requestContext,
}: {
  fileId: string;
  requestContext: RequestContext;
}) {
  const { file } = await slack.webClient.files.info({ file: fileId });
  if (!file) {
    throw new Error(`Slack file ${fileId} was not found.`);
  }
  const channelIds = [
    ...(file.channels ?? []),
    ...(file.groups ?? []),
    ...(file.ims ?? []),
  ];
  if (channelIds.length === 0) {
    throw new Error('This Slack resource is not associated with a channel.');
  }

  const readable = await readableChannelIds({
    channelIds,
    currentThreadId: channelContext(requestContext).threadId,
  });
  if (readable.size === 0) {
    throw new Error(
      'Reading or editing Slack resources from another private conversation is not allowed.'
    );
  }
  return { file, channelIds };
}

// fetchSlackFile attaches the token only for Slack's own hosts, and
// `redirect: 'manual'` keeps a redirect from carrying it anywhere else.
export function fetchPrivateSlackFile({
  url,
  headers,
  method,
  signal,
}: {
  url: string;
  headers?: Record<string, string>;
  method?: 'GET' | 'HEAD';
  signal?: AbortSignal;
}): Promise<Response> {
  return fetchSlackFile({
    fetch: Object.assign(
      (input: URL | RequestInfo, init?: RequestInit) =>
        fetch(input, {
          ...init,
          headers: {
            ...Object.fromEntries(new Headers(init?.headers)),
            ...headers,
          },
          method,
          redirect: 'manual',
          signal,
        }),
      { preconnect: fetch.preconnect }
    ),
    token: env.SLACK_BOT_TOKEN,
    url,
  });
}

function channelTarget(target: Target): { channel: string; threadTs?: string } {
  if (target.type !== 'thread') {
    return { channel: rawId(target.id) };
  }
  const { channel, threadTs } = slack.decodeThreadId(target.id);
  return { channel, threadTs: threadTs || undefined };
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

  if (rawId(channelTarget(target).channel) !== rawId(ctx.channelId)) {
    throw new Error(
      'gorkie can only post into the channel this conversation is already in, not another channel. Ask someone in that channel to post there instead.'
    );
  }
}

export async function slackDestination(
  target: Target
): Promise<{ channel: string; threadTs?: string }> {
  if (target.type === 'user') {
    return {
      channel: rawId((await Chat.getSingleton().openDM(rawId(target.id))).id),
    };
  }
  const destination = channelTarget(target);
  await joinChannel(destination.channel);
  return destination;
}

export async function joinChannel(channelId: string): Promise<void> {
  try {
    await slack.webClient.conversations.join({ channel: rawId(channelId) });
  } catch (error) {
    if (
      slackErrorSchema.safeParse(error).data?.data?.error === ALREADY_IN_CHANNEL
    ) {
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

export async function focusedMessages({
  currentThreadId,
  messages,
  threadId,
}: {
  currentThreadId?: string;
  messages: Message[];
  threadId?: string;
}): Promise<Message[]> {
  const sees =
    threadId && threadId === currentThreadId
      ? await focusFilter(threadId)
      : undefined;
  return sees
    ? messages.filter(
        (message) => message.author.isMe || sees(message.author.userId)
      )
    : messages;
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
