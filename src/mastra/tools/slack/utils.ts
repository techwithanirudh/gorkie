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
  isCurrentThread,
}: {
  target: Target;
  ctx: ChannelContext;
  isCurrentThread: boolean;
}): void {
  if (isCurrentThread) {
    return;
  }
  if (target.type === 'user') {
    if (!ctx.userId || rawId(target.id) !== rawId(ctx.userId)) {
      throw new Error(
        'Gorkie can only DM the person currently asking, not a third party on their behalf. Ask that person to message Gorkie directly instead.'
      );
    }
    return;
  }
  if (!ctx.channelId) {
    throw new Error(
      'No current channel to compare against, so Gorkie will not post there.'
    );
  }
  const targetChannelId =
    target.type === 'channel'
      ? target.id
      : slack.channelIdFromThreadId(target.id);
  if (chatChannelId(targetChannelId) !== chatChannelId(ctx.channelId)) {
    throw new Error(
      'Gorkie can only post to the channel this conversation is already in, not a different channel. Ask a member of that channel to post it there.'
    );
  }
}

export async function joinChannel(channelId: string): Promise<void> {
  try {
    await slack.webClient.conversations.join({
      channel: rawId(channelId),
    });
  } catch {
    /* already a member, or can't join; reads will fail clearly if truly unreadable */
  }
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
