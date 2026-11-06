import type { RequestContext } from '@mastra/core/request-context';
import { chat } from '../chat/instance';
import { limits } from '../config';
import { channelContext } from './context';

const HOUR_MS = 60 * 60 * 1000;

export type LimitKind = keyof typeof limits;

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
  const key = `limit:${kind}:${userId}:${Math.floor(Date.now() / HOUR_MS)}`;
  const used = (await state.get<number>(key)) ?? 0;
  if (used >= max) {
    return `This person has hit the hourly limit of ${max} ${noun}. Tell them to try again later.`;
  }
  await state.set(key, used + 1, HOUR_MS);
  return null;
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
