import type { Duration } from 'date-fns';
import { z } from 'zod';
import type { moderationEvents } from '../db/schema';

export type ModerationAction = 'ban' | 'unban';

const secondsPer = { s: 1, m: 60, h: 3600, d: 86_400, w: 604_800 } as const;

// `perm`, or a count and a unit such as `90m`, `6.7d` or `2w`. Parses to a
// date-fns Duration in whole seconds, since `add` drops fractional days;
// undefined means permanent.
export const banDurationSchema = z.union([
  z.literal('perm').transform(() => undefined),
  z
    .string()
    .toLowerCase()
    .regex(/^\d+(\.\d+)?[smhdw]$/)
    .transform((text) => ({
      count: Number.parseFloat(text),
      unit: text.slice(-1),
    }))
    .pipe(
      z.object({
        count: z.number().positive(),
        unit: z.enum(['s', 'm', 'h', 'd', 'w']),
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
