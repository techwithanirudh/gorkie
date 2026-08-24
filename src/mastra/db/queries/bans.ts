import { rawId } from '../../lib/ids';
import type { UserBan } from '../../types/bans';
import { db } from '../client';

export async function getUserBan(userId: string): Promise<UserBan | undefined> {
  const row = await db
    .selectFrom('user_bans')
    .select(['banned_at', 'banned_by', 'reason', 'user_id'])
    .where('user_id', '=', rawId(userId))
    .executeTakeFirst();
  if (!row) {
    return;
  }
  return {
    bannedAt: row.banned_at,
    bannedBy: row.banned_by,
    reason: row.reason,
    userId: row.user_id,
  };
}

export async function banUser({
  bannedBy,
  reason,
  userId,
}: {
  bannedBy: string;
  reason?: string;
  userId: string;
}): Promise<void> {
  const id = rawId(userId);
  await db
    .insertInto('user_bans')
    .values({
      banned_by: rawId(bannedBy),
      reason: reason?.trim() || null,
      user_id: id,
    })
    .onConflict((oc) =>
      oc.column('user_id').doUpdateSet({
        banned_by: rawId(bannedBy),
        banned_at: new Date(),
        reason: reason?.trim() || null,
      })
    )
    .execute();
}

export async function unbanUser(userId: string): Promise<boolean> {
  const result = await db
    .deleteFrom('user_bans')
    .where('user_id', '=', rawId(userId))
    .executeTakeFirst();
  return Number(result.numDeletedRows) > 0;
}
