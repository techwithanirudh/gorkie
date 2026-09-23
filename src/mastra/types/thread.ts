import { z } from 'zod';

export const threadStateSchema = z.looseObject({
  lastSeenMessage: z.string().optional(),
  respondOnThreadMessages: z.boolean().optional(),
});

export type ThreadState = z.infer<typeof threadStateSchema>;
