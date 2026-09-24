import { and, count, eq, gt, lt, min, sql } from 'drizzle-orm';
import { usage as config } from '../../config';
import { rawId } from '../../lib/ids';
import type { TurnUsage } from '../../types';
import { db } from '../client';
import { usageTurns } from '../schema';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export async function turnUsage(userId: string): Promise<TurnUsage> {
  const now = Date.now();
  const hourAgo = new Date(now - HOUR);
  const [row] = await db
    .select({
      day: count(),
      hour: sql<number>`count(*) filter (where ${usageTurns.createdAt} > ${hourAgo})`.mapWith(
        Number
      ),
      oldestInDay: min(usageTurns.createdAt),
      oldestInHour:
        sql<Date | null>`min(${usageTurns.createdAt}) filter (where ${usageTurns.createdAt} > ${hourAgo})`.mapWith(
          usageTurns.createdAt
        ),
    })
    .from(usageTurns)
    .where(
      and(
        eq(usageTurns.userId, rawId(userId)),
        gt(usageTurns.createdAt, new Date(now - DAY))
      )
    );
  return {
    day: {
      limit: config.turnsPerDay,
      remaining: Math.max(0, config.turnsPerDay - (row?.day ?? 0)),
      resetsAt: row?.oldestInDay
        ? new Date(row.oldestInDay.getTime() + DAY)
        : undefined,
    },
    hour: {
      limit: config.turnsPerHour,
      remaining: Math.max(0, config.turnsPerHour - (row?.hour ?? 0)),
      resetsAt: row?.oldestInHour
        ? new Date(row.oldestInHour.getTime() + HOUR)
        : undefined,
    },
  };
}

// TODO(slopradar): review: correctness (TOCTOU) | chat/usage.ts runs turnUsage then recordTurn as separate statements, so concurrent turns from one user all pass the check and overshoot the limit | one claimTurn query: pg_advisory_xact_lock(hashtext(userId)) in a transaction that counts, compares and inserts, as insertMCPServer already does
export async function recordTurn(userId: string): Promise<void> {
  const id = rawId(userId);
  await db.insert(usageTurns).values({ userId: id });
  await db
    .delete(usageTurns)
    .where(
      and(
        eq(usageTurns.userId, id),
        lt(usageTurns.createdAt, new Date(Date.now() - DAY))
      )
    );
}
