import { z } from 'zod';
import { toolDisplayModeSchema } from './display';

export const threadStateSchema = z
  .looseObject({
    dropMessagesBefore: z.number().optional(),
    // Empty or unset means everyone; the thread owner and moderators always
    // get through whatever it holds.
    focusedUserIds: z.array(z.string()).optional(),
    lastSeenMessage: z.string().optional(),
    // Only for skipping a Slack title update that would change nothing.
    lastSentSlackTitle: z.string().optional(),
    respondOnThreadMessages: z.boolean().optional(),
    toolDisplay: toolDisplayModeSchema.optional(),
    focus: z.array(z.string()).optional(),
    slackTitle: z.string().optional(),
  })
  .transform(({ focus, slackTitle, ...state }) => ({
    ...(focus ? { focusedUserIds: focus } : {}),
    ...(slackTitle ? { lastSentSlackTitle: slackTitle } : {}),
    ...state,
  }));

export type ThreadState = z.infer<typeof threadStateSchema>;
