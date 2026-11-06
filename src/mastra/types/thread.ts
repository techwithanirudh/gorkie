import { z } from 'zod';

export const threadStateSchema = z.object({
  dropMessagesBefore: z.number().optional(),
  lastSeenMessage: z.string().optional(),
  // Only for skipping a Slack title update that would change nothing.
  lastSentSlackTitle: z.string().optional(),
  respondOnThreadMessages: z.boolean().optional(),
});

export type ThreadState = z.infer<typeof threadStateSchema>;
