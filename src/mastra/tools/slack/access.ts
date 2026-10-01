import { slack } from '../../chat/client';
import { slack as slackConfig } from '../../config';
import { parseSlackInput } from '../../lib/ids';
import { logger } from '../../lib/logger';
import { ALREADY_IN_CHANNEL } from '../../lib/logger/slack';
import type { ChannelContext } from '../../types';
import { slackErrorSchema, type Target } from '../../types/tools/index';

function isCurrent({
  channelId,
  ctx,
}: {
  channelId: string;
  ctx: ChannelContext;
}): boolean {
  return parseSlackInput(ctx.threadId).channel === channelId;
}

export async function canRead({
  channelId,
  ctx,
}: {
  channelId: string;
  ctx: ChannelContext;
}): Promise<boolean> {
  if (isCurrent({ channelId, ctx })) {
    return true;
  }
  const { channelVisibility } = await slack.fetchChannelInfo(
    slack.encodeThreadId({ channel: channelId, threadTs: '' })
  );
  return channelVisibility === 'workspace';
}

export async function assertCanRead({
  channelId,
  ctx,
}: {
  channelId: string;
  ctx: ChannelContext;
}): Promise<void> {
  if (!(await canRead({ channelId, ctx }))) {
    throw new Error(
      'Reading DMs, private channels, or external conversations is not allowed.'
    );
  }
}

// The current conversation is where the bot is already talking, so only
// another (public) channel needs a join before its history can be read.
export async function openReadableChannel({
  channelId,
  ctx,
}: {
  channelId: string;
  ctx: ChannelContext;
}): Promise<void> {
  if (isCurrent({ channelId, ctx })) {
    return;
  }
  await assertCanRead({ channelId, ctx });
  try {
    await slack.webClient.conversations.join({ channel: channelId });
  } catch (error) {
    if (
      slackErrorSchema.safeParse(error).data?.data?.error !== ALREADY_IN_CHANNEL
    ) {
      logger.warn('[slack] could not join the channel', { channelId, error });
    }
  }
}

export async function firstReadable({
  channelIds,
  ctx,
}: {
  channelIds: string[];
  ctx: ChannelContext;
}): Promise<string | undefined> {
  const current = channelIds.find((channelId) => isCurrent({ channelId, ctx }));
  if (current) {
    return current;
  }
  // Promise.any rejects only when every lookup failed or came back unreadable,
  // which is the "none readable" answer.
  return await Promise.any(
    channelIds.map(async (channelId) => {
      if (await canRead({ channelId, ctx })) {
        return channelId;
      }
      throw new Error(`${channelId} is not readable.`);
    })
  ).catch(() => undefined);
}

export async function readableChannels({
  channelIds,
  ctx,
}: {
  channelIds: string[];
  ctx: ChannelContext;
}): Promise<Set<string>> {
  const pending = channelIds.values();
  const readable = new Set<string>();
  const worker = async (): Promise<void> => {
    const next = pending.next();
    if (next.done) {
      return;
    }
    // A channel whose visibility lookup fails is left out, like an unreadable one.
    if (await canRead({ channelId: next.value, ctx }).catch(() => false)) {
      readable.add(next.value);
    }
    return worker();
  };
  await Promise.all(
    Array.from({ length: slackConfig.channelLookupConcurrency }, worker)
  );
  return readable;
}

export function assertCanPostTo({
  target,
  ctx,
}: {
  target: Target;
  ctx: ChannelContext;
}): void {
  if (target.type === 'user') {
    if (!ctx.userId || parseSlackInput(target.id).channel !== ctx.userId) {
      throw new Error(
        'gorkie can only DM the person currently asking, not a third party on their behalf. Ask that person to message gorkie directly instead.'
      );
    }
    return;
  }

  if (!ctx.channelId) {
    throw new Error('No current Slack channel to compare against.');
  }

  const channel =
    target.type === 'thread'
      ? slack.decodeThreadId(target.id).channel
      : parseSlackInput(target.id).channel;
  if (channel !== parseSlackInput(ctx.channelId).channel) {
    throw new Error(
      'gorkie can only post into the channel this conversation is already in, not another channel. Ask someone in that channel to post there instead.'
    );
  }
}
