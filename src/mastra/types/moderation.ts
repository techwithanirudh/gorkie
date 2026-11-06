import { z } from 'zod';
import type { moderationEvents } from '../db/schema';

export type ModerationAction = 'ban' | 'unban';

export const banDurationSchema = z.enum(['1h', '1d', '7d', '30d', 'perm']);
export type BanDuration = z.infer<typeof banDurationSchema>;

export type ModerationEvent = typeof moderationEvents.$inferSelect;

export type ActiveBan = Pick<
  ModerationEvent,
  'actorId' | 'expiresAt' | 'reason'
>;
