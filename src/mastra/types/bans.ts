import type { Generated } from 'kysely';

export interface UserBansTable {
  banned_at: Generated<Date>;
  banned_by: string;
  reason: string | null;
  user_id: string;
}

export interface UserBan {
  bannedAt: Date;
  bannedBy: string;
  reason: string | null;
  userId: string;
}
