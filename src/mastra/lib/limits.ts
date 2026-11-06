import type { RequestContext } from '@mastra/core/request-context';
import { chat } from '../chat/instance';
import { limits } from '../config';
import { channelContext } from './context';

const HOUR_MS = 60 * 60 * 1000;

export type LimitKind = keyof typeof limits;

function hourKey({ kind, userId }: { kind: string; userId: string }): string {
  return `limit:${kind}:${userId}:${Math.floor(Date.now() / HOUR_MS)}`;
}

// Counted per clock hour in Chat state, which has no atomic increment, so two
// calls at the same moment can both pass. These stop abuse, not exact billing.
export async function overLimit({
  kind,
  userId,
}: {
  kind: LimitKind;
  userId: string;
}): Promise<string | null> {
  const { max, noun } = limits[kind];
  const state = chat().getState();
  const key = hourKey({ kind, userId });
  const used = (await state.get<number>(key)) ?? 0;
  if (used >= max) {
    return `This person has hit the hourly limit of ${max} ${noun}. Tell them to try again later.`;
  }
  // Tokens are counted when a run ends, since nobody knows the cost up front.
  if (kind !== 'tokens') {
    await state.set(key, used + 1, HOUR_MS);
  }
  return null;
}

export async function addTokens({
  tokens,
  userId,
}: {
  tokens: number;
  userId: string;
}): Promise<void> {
  const state = chat().getState();
  const key = hourKey({ kind: 'tokens', userId });
  const used = (await state.get<number>(key)) ?? 0;
  await state.set(key, used + tokens, HOUR_MS);
}

const compact = new Intl.NumberFormat('en', { notation: 'compact' });

export function usageLine({
  max,
  noun,
  used,
}: {
  max: number;
  noun: string;
  used: number;
}): string {
  const filled = Math.min(10, Math.round((used / max) * 10));
  const bar = `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`;
  return `\`${bar}\`  ${noun.charAt(0).toUpperCase()}${noun.slice(1)}: ${compact.format(used)} of ${compact.format(max)}`;
}

export function usage(userId: string) {
  const state = chat().getState();
  return Promise.all(
    Object.entries(limits).map(async ([kind, { max, noun }]) => ({
      max,
      noun,
      used: (await state.get<number>(hourKey({ kind, userId }))) ?? 0,
    }))
  );
}

export async function assertWithinLimit({
  kind,
  requestContext,
}: {
  kind: LimitKind;
  requestContext?: RequestContext;
}): Promise<void> {
  const { userId } = channelContext(requestContext);
  if (!userId) {
    return;
  }
  const message = await overLimit({ kind, userId });
  if (message) {
    throw new Error(message);
  }
}
