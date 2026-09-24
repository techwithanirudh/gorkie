import { z } from 'zod';
import { toolDisplayModeSchema } from './display';

export const threadStateSchema = z.looseObject({
  dropMessagesBefore: z.number().optional(),
  focus: z.array(z.string()).optional(),
  lastSeenMessage: z.string().optional(),
  slackTitle: z.string().optional(),
  respondOnThreadMessages: z.boolean().optional(),
  toolDisplay: toolDisplayModeSchema.optional(),
});

export type ThreadState = z.infer<typeof threadStateSchema>;
