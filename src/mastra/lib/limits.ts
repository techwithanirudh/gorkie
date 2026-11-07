import type { RequestContext } from '@mastra/core/request-context';
import { limits, limitWindowHours } from '../config';
import { addUsage, readUsage } from '../db/queries/usage';
import { channelContext } from './context';

type LimitKind = keyof typeof limits;

function resetsIn(windowStart: Date): string {
  const minutes = Math.max(
    1,
    Math.ceil(
      (windowStart.getTime() + limitWindowHours * 3_600_000 - Date.now()) /
        60_000
    )
  );
  return minutes < 60
    ? `${minutes}m`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export async function overLimit({
  kind,
  userId,
}: {
  kind: LimitKind;
  userId: string;
}): Promise<string | null> {
  const { max, noun } = limits[kind];
  // Tokens are counted when a run ends, since nobody knows the cost up front.
  if (
    kind !== 'tokens' &&
    (await addUsage({ amount: 1, ceiling: max, kind, userId }))
  ) {
    return null;
  }
  const row = (await readUsage(userId)).find((entry) => entry.kind === kind);
  if (!row || row.used < max) {
    return null;
  }
  return `This person has hit the limit of ${max} ${noun} per ${limitWindowHours} hours. It resets in ${resetsIn(row.windowStart)}. Tell them to try again then.`;
}

const compact = new Intl.NumberFormat('en', { notation: 'compact' });

export function usageLine({
  max,
  noun,
  resets,
  used,
}: {
  max: number;
  noun: string;
  resets?: string;
  used: number;
}): string {
  const filled = Math.min(10, Math.round((used / max) * 10));
  const bar = `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`;
  const line = `\`${bar}\`  ${noun.charAt(0).toUpperCase()}${noun.slice(1)}: ${compact.format(used)} of ${compact.format(max)}`;
  return resets ? `${line}, resets in ${resets}` : line;
}

export async function usage(userId: string) {
  const rows = await readUsage(userId);
  return Object.entries(limits).map(([kind, { max, noun }]) => {
    const row = rows.find((entry) => entry.kind === kind);
    return {
      max,
      noun,
      resets: row && resetsIn(row.windowStart),
      used: row?.used ?? 0,
    };
  });
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
