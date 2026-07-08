import type { Message } from 'chat';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { chat } from '../../chat/instance';
import type { Target } from '../../chat/target';
import { chatChannelId, rawId } from '../../lib/ids';
import type { ChannelContext } from '../../types';

const postedMessageRecord = z.object({
  requestedBy: z.string().min(1),
  isSelfDm: z.boolean().default(false),
});

function postedMessageKey({ channel, ts }: { channel: string; ts: string }) {
  return `slack:posted-message:${rawId(channel)}:${ts}`;
}

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
  if (target.type === 'thread' && target.id === ctx.threadId) {
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

export async function recordPostedMessage({
  target,
  sent,
  requestedBy,
  isSelfDm,
}: {
  target: Target;
  sent: { id: string; threadId?: string };
  requestedBy: string | undefined;
  isSelfDm: boolean;
}) {
  if (!requestedBy) {
    return;
  }
  let channel = target.id;
  if (target.type === 'thread') {
    channel = slack.channelIdFromThreadId(target.id);
  }
  if (sent.threadId) {
    channel = slack.channelIdFromThreadId(sent.threadId);
  }
  await chat()
    .getState()
    .set(postedMessageKey({ channel, ts: sent.id }), {
      requestedBy: rawId(requestedBy),
      isSelfDm,
    });
}

export async function assertCanManagePostedMessage({
  message,
  ctx,
}: {
  message: { channel: string; ts: string };
  ctx: ChannelContext;
}) {
  if (!ctx.userId) {
    throw new Error(
      'No current Slack user, so Gorkie will not edit or delete messages.'
    );
  }
  const record = postedMessageRecord.safeParse(
    await chat().getState().get(postedMessageKey(message))
  );
  if (!record.success) {
    throw new Error(
      'Gorkie can only edit or delete messages it previously sent through post_message and recorded ownership for.'
    );
  }
  if (rawId(record.data.requestedBy) !== rawId(ctx.userId)) {
    throw new Error(
      'Only the same Slack user who asked Gorkie to send this message can edit or delete it.'
    );
  }
  return { ...message, isSelfDm: record.data.isSelfDm };
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
