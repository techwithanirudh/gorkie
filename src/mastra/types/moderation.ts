import { z } from 'zod';

export type ModerationAction = 'ban' | 'unban';

export const banDurationSchema = z.enum(['1h', '1d', '7d', '30d', 'perm']);
export type BanDuration = z.infer<typeof banDurationSchema>;

export interface ActiveBan {
  actorId: string;
  expiresAt: Date | null;
  reason: string | null;
}

export interface ModerationEvent {
  action: ModerationAction;
  actorId: string;
  createdAt: Date;
  expiresAt: Date | null;
  id: string;
  reason: string | null;
  userId: string;
}
