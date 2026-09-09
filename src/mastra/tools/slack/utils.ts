import type { Message } from 'chat';
import { slack } from '../../chat/client';
import { chat } from '../../chat/instance';
import type { Target } from '../../chat/target';
import { chatChannelId, rawId } from '../../lib/ids';
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

export function assertCanPostTo({
  target,
  ctx,
}: {
  target: Target;
  ctx: ChannelContext;
}): void {
  if (
    target.type === 'user' &&
    (!ctx.userId || rawId(target.id) !== rawId(ctx.userId))
  ) {
    throw new Error(
      'gorkie can only DM the person currently asking, not a third party on their behalf. Ask that person to message gorkie directly instead.'
    );
  }
}

export async function joinChannel(channelId: string): Promise<void> {
  try {
    await slack.webClient.conversations.join({
      channel: rawId(channelId),
    });
  } catch {
    // Best effort: the subsequent read reports inaccessible channels.
  }
}

export function slackThreadId({
  channelId,
  threadId,
}: {
  channelId?: string;
  threadId: string;
}): string {
  let channel = channelId ? rawId(channelId) : undefined;
  let timestamp = threadId;

  if (threadId.startsWith('slack:')) {
    ({ channel, threadTs: timestamp } = slack.decodeThreadId(threadId));
  } else {
    const permalink = threadId.match(/\/archives\/([CDG][A-Z0-9]+)\/p(\d+)/);
    channel = permalink?.[1] ?? channel;
    timestamp = permalink?.[2] ?? timestamp;
  }

  const compact = timestamp.replace('.', '');
  if (!(channel && /^\d{16}$/.test(compact))) {
    return threadId;
  }

  return slack.encodeThreadId({
    channel,
    threadTs: `${compact.slice(0, 10)}.${compact.slice(10)}`,
  });
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
