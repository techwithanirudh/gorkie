import { z } from 'zod';

export const profileSchema = z.object({
  preferences: z
    .record(
      z.string(),
      z
        .string()
        .describe(
          "What is true, and the date it was said, e.g. 'wants terse answers; 2026-09-15'."
        )
    )
    .optional()
    .describe(
      "Standing preferences this person has stated, keyed by a short slug such as 'no-emoji' or 'links-first'. Only things they asked for directly, never something inferred from one exchange."
    ),
  replies: z
    .enum(['just the answer', 'answer plus reasoning', 'links first'])
    .optional()
    .describe('What shape of reply they have asked for.'),
  timezone: z
    .string()
    .optional()
    .describe('IANA timezone, e.g. Europe/Amsterdam.'),
  writing: z
    .object({
      casing: z.enum(['all lowercase', 'sentence case', 'mixed']).optional(),
      emoji: z.enum(['none', 'sparing', 'frequent']).optional(),
      language: z
        .string()
        .optional()
        .describe('The language they write in, if not English.'),
      length: z
        .enum(['fragments', 'a line or two', 'full paragraphs'])
        .optional(),
      register: z.enum(['blunt', 'casual', 'precise', 'formal']).optional(),
      shorthand: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          'Abbreviations they use, keyed by the abbreviation, valued by what it means.'
        ),
    })
    .optional()
    .describe(
      'How this person writes, so gorkie can mirror their style while keeping its own persona. Style only, never substance.'
    ),
});
