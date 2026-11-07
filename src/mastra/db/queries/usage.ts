import { and, eq, gt, sql } from 'drizzle-orm';
import { limitWindowHours } from '../../config';
import { rawId } from '../../lib/ids';
import { db } from '../client';
import { usage } from '../schema';

const windowOpensAfter = sql`now() - make_interval(hours => ${limitWindowHours})`;

export function readUsage(userId: string) {
  return db
    .select()
    .from(usage)
    .where(
      and(
        eq(usage.userId, rawId(userId)),
        gt(usage.windowStart, windowOpensAfter)
      )
    );
}

// One statement, so two calls at once can't both pass the ceiling. Returns
// whether the amount was counted, which is false only at the ceiling.
export async function addUsage({
  amount,
  ceiling,
  kind,
  userId,
}: {
  amount: number;
  ceiling?: number;
  kind: string;
  userId: string;
}): Promise<boolean> {
  const expired = sql`${usage.windowStart} <= ${windowOpensAfter}`;
  const rows = await db
    .insert(usage)
    .values({ kind, used: amount, userId: rawId(userId) })
    .onConflictDoUpdate({
      target: [usage.userId, usage.kind],
      set: {
        used: sql`case when ${expired} then excluded.used else ${usage.used} + excluded.used end`,
        windowStart: sql`case when ${expired} then now() else ${usage.windowStart} end`,
      },
      ...(ceiling === undefined
        ? {}
        : { setWhere: sql`${expired} or ${usage.used} < ${ceiling}` }),
    })
    .returning({ used: usage.used });
  return rows.length > 0;
}
