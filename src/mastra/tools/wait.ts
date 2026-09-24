import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { agent as agentConfig } from '../config';
import { channelWake, waitMetadata } from './scheduled-tasks/queries';

export const waitTool = createTool({
  id: 'wait',
  description:
    "Pause the conversation and automatically resume it later, without blocking. Use for one-time delays, spaced-out polling, or giving a background job or external event time to progress. Before calling this, send a short text message telling the user what you're waiting for; the typing status clears the moment your turn ends, so that message is the only lasting sign you're still on it. Call this last and then stop; you will be woken up automatically when the wait is over. Calling it always ends your turn, the same as skip. For recurring work, use create_scheduled_task instead.",
  inputSchema: z.strictObject({
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
  }),
  outputSchema: z.strictObject({ seconds: z.number() }),
  transform: {
    display: {
      output: ({ input, output }) => ({
        summary: `Waiting ${output?.seconds ?? 0} seconds for ${input?.reason ?? 'the next check'}`,
      }),
    },
  },
  execute: async ({ seconds, reason }, context) => {
    const schedules = context.mastra?.schedules;
    if (!schedules) {
      throw new Error(
        'The scheduler is not available, so this conversation cannot wait.'
      );
    }
    const threadId = context.agent?.threadId;
    const memoryResourceId = context.agent?.resourceId;
    if (!(threadId && memoryResourceId)) {
      throw new Error('No current Slack thread/resource to wait in.');
    }

    const fireAt = new Date(Date.now() + seconds * 1000);
    const cron = `${fireAt.getUTCSeconds()} ${fireAt.getUTCMinutes()} ${fireAt.getUTCHours()} ${fireAt.getUTCDate()} ${fireAt.getUTCMonth() + 1} *`;

    await schedules.create({
      agentId: agentConfig.id,
      cron,
      timezone: 'UTC',
      prompt: `Your ${seconds}s wait is over (waiting for: ${reason}). Continue and respond in this same Slack conversation with the result.`,
      threadId,
      resourceId: memoryResourceId,
      tagName: 'wait-resume',
      ...channelWake(context),
      metadata: waitMetadata,
    });

    return {
      seconds,
    };
  },
});
