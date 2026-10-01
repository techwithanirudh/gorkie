import { z } from 'zod';

export const statusUpdateInputSchema = z.strictObject({
  status: z
    .string()
    .min(1)
    .describe(
      'A few words, lowercase, present tense, no trailing punctuation, e.g. "reading the deploy logs".'
    ),
});
