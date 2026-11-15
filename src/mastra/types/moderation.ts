import type { Duration } from 'date-fns';
import { z } from 'zod';
import type { moderationEvents } from '../db/schema';

export type ModerationAction = 'ban' | 'unban';

const units = ['s', 'm', 'h', 'd', 'w'] as const;
const secondsPer: Record<(typeof units)[number], number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86_400,
  w: 604_800,
};

// Whole seconds, because date-fns `add` drops fractional days.
export const banDurationSchema = z.union([
  z.literal('perm').transform(() => undefined),
  z
    .string()
    .toLowerCase()
    .regex(/^\d+(\.\d+)?[a-z]$/)
    .transform((text) => ({
      count: Number.parseFloat(text),
      unit: text.slice(-1),
    }))
    .pipe(
      z.object({
        count: z.number().positive(),
        unit: z.enum(units),
      })
    )
    .transform(
      ({ count, unit }): Duration => ({
        seconds: Math.round(count * secondsPer[unit]),
      })
    )
    .refine((duration) => (duration.seconds ?? 0) > 0),
]);

export type ModerationEvent = typeof moderationEvents.$inferSelect;

export type BanStatus =
  | { status: 'banned'; ban: ModerationEvent }
  | { status: 'clear' | 'lookup-failed' };
