import type { Message } from 'chat';
import { slack } from '../../chat/client';
import { chat } from '../../chat/instance';
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
  if (metadata.isDM || metadata.channelVisibility !== 'workspace') {
    throw new Error(
      'Reading DMs, private channels, or external conversations is not allowed.'
    );
  }
  return metadata;
}

export async function joinChannel(channelId: string): Promise<void> {
  try {
    await slack.webClient.apiCall('conversations.join', {
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
