import { z } from 'zod';
import { toolDisplayModeSchema } from './display';

export const threadStateSchema = z.looseObject({
  lastSeenMessage: z.string().optional(),
  respondOnThreadMessages: z.boolean().optional(),
  toolDisplay: toolDisplayModeSchema.optional(),
});

export type ThreadState = z.infer<typeof threadStateSchema>;
