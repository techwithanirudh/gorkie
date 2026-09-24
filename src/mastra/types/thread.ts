import { z } from 'zod';
import { toolDisplayModeSchema } from './display';

export const threadStateSchema = z.looseObject({
  // Epoch ms of the last stop or leave. A message sent before it that only
  // reaches a turn afterwards (delayed delivery, a slow handler) is dropped.
  dropMessagesBefore: z.number().optional(),
  lastSeenMessage: z.string().optional(),
  // The title last sent to Slack, so a turn only renames the DM when it changed.
  slackTitle: z.string().optional(),
  respondOnThreadMessages: z.boolean().optional(),
  toolDisplay: toolDisplayModeSchema.optional(),
});

export type ThreadState = z.infer<typeof threadStateSchema>;
