import type { Message } from 'chat';
import { slack } from '../../chat/client';
import { chat } from '../../chat/instance';
import type { Target } from '../../chat/target';
import { chatChannelId, rawId } from '../../lib/ids';

export async function assertReadableChannel(
  channelId: string,
  currentThreadId?: string
) {
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

async function isChannelMember(
  channelId: string,
  userId: string
): Promise<boolean> {
  const channel = rawId(channelId);
  let cursor: string | undefined;
  do {
    const response = await slack.webClient.conversations.members({
      channel,
      limit: 1000,
      cursor,
    });
    if (response.members?.includes(userId)) {
      return true;
    }
    cursor = response.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return false;
}

/**
 * Prevents using Gorkie as a relay into channels the requesting user has no
 * access to: only Gorkie's own membership was previously required, so any
 * user could have it post into any channel Gorkie belongs to.
 */
export async function assertCanPostTo(
  target: Target,
  userId: string | undefined,
  isCurrentThread: boolean
): Promise<void> {
  if (isCurrentThread || target.type === 'user') {
    return;
  }
  if (!userId) {
    throw new Error(
      'Cannot verify channel membership without a known requesting user, so Gorkie will not post there.'
    );
  }
  if (!(await isChannelMember(target.id, userId))) {
    throw new Error(
      'You are not a member of that channel, so Gorkie cannot post there on your behalf. Ask a member to invite you, or post it yourself.'
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
    dateSent: message.metadata.dateSent?.toISOString(),
    edited: message.metadata.edited,
    isMention: message.isMention,
    attachments: (message.attachments ?? []).map((a) => ({
      type: a.type,
      name: a.name,
      mimeType: a.mimeType,
      url: a.url,
    })),
  };
}
