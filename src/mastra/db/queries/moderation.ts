import { desc, eq } from 'drizzle-orm';
import { rawId } from '../../lib/ids';
import type { ActiveBan, ModerationEvent } from '../../types';
import { db } from '../client';
import { moderationEvents } from '../schema';

function isLive(row: ModerationEvent): boolean {
  return (
    row.action === 'ban' && !(row.expiresAt && row.expiresAt <= new Date())
  );
}

export async function activeBan(
  userId: string
): Promise<ActiveBan | undefined> {
  const [row] = await db
    .select()
    .from(moderationEvents)
    .where(eq(moderationEvents.userId, rawId(userId)))
    .orderBy(desc(moderationEvents.createdAt))
    .limit(1);
  if (!(row && isLive(row))) {
    return;
  }
  return { actorId: row.actorId, expiresAt: row.expiresAt, reason: row.reason };
}

export async function activeBans(): Promise<ModerationEvent[]> {
  const rows = await db
    .selectDistinctOn([moderationEvents.userId])
    .from(moderationEvents)
    .orderBy(moderationEvents.userId, desc(moderationEvents.createdAt));
  return rows.filter(isLive);
}

export async function recordDecision({
  action,
  userId,
  actorId,
  reason,
  expiresAt,
}: {
  action: ModerationEvent['action'];
  userId: string;
  actorId: string;
  reason?: string;
  expiresAt?: Date;
}): Promise<ModerationEvent> {
  const [event] = await db
    .insert(moderationEvents)
    .values({
      action,
      userId: rawId(userId),
      actorId: rawId(actorId),
      reason: reason ?? null,
      expiresAt: expiresAt ?? null,
    })
    .returning();
  if (!event) {
    throw new Error(`Could not record the ${action}.`);
  }
  return event;
}

export async function getModerationEvent(
  id: string
): Promise<ModerationEvent | undefined> {
  const [row] = await db
    .select()
    .from(moderationEvents)
    .where(eq(moderationEvents.id, id));
  return row;
}
