import { z } from 'zod';

export const waitInputSchema = z.strictObject({
  seconds: z
    .number()
    .int()
    .min(1)
    // The resume cron has no year field, so a wait of a year or more fires early.
    .max(364 * 24 * 60 * 60)
    .describe('How many seconds to wait, at most 364 days.'),
  reason: z
    .string()
    .min(1)
    .describe('What you are waiting for, and what to do once it resumes.'),
});
