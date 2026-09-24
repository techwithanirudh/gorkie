import { and, count, eq, gt, lt, min, sql } from 'drizzle-orm';
import { usage as config } from '../../config';
import { rawId } from '../../lib/ids';
import type { TurnUsage } from '../../types';
import { db } from '../client';
import { usageTurns } from '../schema';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function readUsage({
  executor,
  userId,
}: {
  executor: Pick<typeof db, 'select'>;
  userId: string;
}): Promise<TurnUsage> {
  const now = Date.now();
  const hourAgo = new Date(now - HOUR);
  const [row] = await executor
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

export function turnUsage(userId: string): Promise<TurnUsage> {
  return readUsage({ executor: db, userId });
}

export async function recordTurnWithinLimit(
  userId: string
): Promise<{ recorded: boolean; usage: TurnUsage }> {
  const id = rawId(userId);
  return await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${id}))`);
    const usage = await readUsage({ executor: tx, userId });
    if (usage.day.remaining === 0 || usage.hour.remaining === 0) {
      return { recorded: false, usage };
    }
    await tx.insert(usageTurns).values({ userId: id });
    await tx
      .delete(usageTurns)
      .where(
        and(
          eq(usageTurns.userId, id),
          lt(usageTurns.createdAt, new Date(Date.now() - DAY))
        )
      );
    return { recorded: true, usage };
  });
}
