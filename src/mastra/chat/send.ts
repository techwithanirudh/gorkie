import { randomUUID } from 'node:crypto';
import type { ActionEvent } from 'chat';
import { z } from 'zod';
import { send as config } from '../config';
import { rawId } from '../lib/ids';
import { logger } from '../lib/logger';
import { slack } from './client';
import { chat } from './instance';
import { neutralizeBroadcasts } from './message';

export const sendIds = { confirm: 'send_confirm', cancel: 'send_cancel' };

const pendingSendSchema = z.object({
  channel: z.string().optional(),
  threadTs: z.string().optional(),
  userId: z.string().optional(),
  label: z.string(),
  message: z.string(),
  requesterId: z.string(),
  username: z.string(),
  avatarUrl: z.string().optional(),
});

type PendingSend = z.infer<typeof pendingSendSchema>;

const slackErrorSchema = z.looseObject({
  data: z.looseObject({ error: z.string() }),
});
const interactionSchema = z.looseObject({ response_url: z.url() });

const refusals: Record<string, string> = {
  channel_not_found:
    "I can't see that channel. Invite me first, then ask again.",
  is_archived: 'That channel is archived.',
  restricted_action: "I'm not allowed to post in that channel.",
  restricted_action_read_only_channel:
    "I'm not allowed to post in that channel.",
  ekm_access_denied: "I'm not allowed to post in that channel.",
};

function slackError(error: unknown): string | undefined {
  return slackErrorSchema.safeParse(error).data?.data.error;
}

function pendingKey(id: string): string {
  return `send:${id}`;
}

function messageBlocks({
  message,
  requesterId,
}: {
  message: string;
  requesterId: string;
}): unknown[] {
  return [
    { type: 'markdown', text: message },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `Sent by <@${requesterId}> via gorkie` },
      ],
    },
  ];
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
      throw new Error(
        refusals[slackError(error) ?? ''] ?? "I can't check that channel.",
        { cause: error }
      );
    });
  const details = info.channel;
  if (details?.is_archived) {
    throw new Error('That channel is archived.');
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

export async function offerSend({
  pending,
  previewChannel,
  previewThreadTs,
}: {
  pending: PendingSend;
  previewChannel: string;
  previewThreadTs?: string;
}): Promise<void> {
  const id = randomUUID();
  const message = neutralizeBroadcasts(pending.message);
  await chat()
    .getState()
    .set(pendingKey(id), { ...pending, message }, config.pendingTtlMs);
  await slack.webClient.chat.postEphemeral({
    channel: previewChannel,
    user: pending.requesterId,
    ...(previewThreadTs ? { thread_ts: previewThreadTs } : {}),
    text: `Send this on your behalf to ${pending.label}?`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Send this on your behalf to ${pending.label}?* Only you can see this preview.`,
        },
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          ...(pending.avatarUrl
            ? [
                {
                  type: 'image',
                  image_url: pending.avatarUrl,
                  alt_text: pending.username,
                },
              ]
            : []),
          { type: 'mrkdwn', text: `*${pending.username}*` },
        ],
      },
      ...messageBlocks({ message, requesterId: pending.requesterId }),
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            action_id: sendIds.confirm,
            text: { type: 'plain_text', text: 'Send' },
            style: 'primary',
            value: id,
          },
          {
            type: 'button',
            action_id: sendIds.cancel,
            text: { type: 'plain_text', text: 'Cancel' },
            value: id,
          },
        ],
      },
    ] as never,
  });
}

async function respond({
  event,
  replace,
  text,
}: {
  event: ActionEvent;
  replace: boolean;
  text: string;
}): Promise<void> {
  const interaction = interactionSchema.safeParse(event.raw);
  if (!interaction.success) {
    return;
  }
  await fetch(interaction.data.response_url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      replace_original: replace,
      response_type: 'ephemeral',
      text,
    }),
  });
}

async function deliver(pending: PendingSend): Promise<string | undefined> {
  const channel = pending.userId
    ? rawId((await chat().openDM(pending.userId)).channelId)
    : pending.channel;
  if (!channel) {
    throw new Error('A pending send has no destination.');
  }
  const post = () =>
    slack.webClient.chat.postMessage({
      channel,
      ...(pending.threadTs ? { thread_ts: pending.threadTs } : {}),
      text: pending.message,
      blocks: messageBlocks(pending) as never,
      username: pending.username,
      unfurl_links: false,
      ...(pending.avatarUrl ? { icon_url: pending.avatarUrl } : {}),
    });
  const sent = await post().catch(async (error: unknown) => {
    if (slackError(error) !== 'not_in_channel') {
      throw error;
    }
    await slack.webClient.conversations.join({ channel });
    return post();
  });
  if (!sent.ts) {
    return;
  }
  const link = await slack.webClient.chat
    .getPermalink({ channel, message_ts: sent.ts })
    .catch(() => undefined);
  return link?.permalink;
}

async function loadPending(id: string | undefined) {
  if (!id) {
    return null;
  }
  const stored = await chat().getState().get(pendingKey(id));
  return pendingSendSchema.safeParse(stored).data ?? null;
}

export async function onSendCancel(event: ActionEvent): Promise<void> {
  const pending = await loadPending(event.value);
  if (event.value && pending?.requesterId === event.user.userId) {
    await chat().getState().delete(pendingKey(event.value));
    await respond({ event, replace: true, text: 'Cancelled.' });
    return;
  }
  await respond({ event, replace: !pending, text: 'This expired, ask again.' });
}

export async function onSendConfirm(event: ActionEvent): Promise<void> {
  const pending = await loadPending(event.value);
  if (!(event.value && pending)) {
    await respond({ event, replace: true, text: 'This expired, ask again.' });
    return;
  }
  if (pending.requesterId !== event.user.userId) {
    return;
  }
  const state = chat().getState();
  const claim = `${pendingKey(event.value)}:claim`;
  if (!(await state.setIfNotExists(claim, true, config.pendingTtlMs))) {
    return;
  }
  try {
    const link = await deliver(pending);
    await state.delete(pendingKey(event.value));
    await respond({
      event,
      replace: true,
      text: link ? `Sent. <${link}|View message>` : 'Sent.',
    });
  } catch (error) {
    const refusal = refusals[slackError(error) ?? ''];
    if (refusal) {
      await state.delete(pendingKey(event.value));
      await respond({ event, replace: true, text: `Not sent: ${refusal}` });
      return;
    }
    logger.error('[send] delivery failed', { error, label: pending.label });
    await state.delete(claim);
    await respond({
      event,
      replace: false,
      text: 'Something broke and nothing was sent. Click Send to try again.',
    });
  }
}
