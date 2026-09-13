import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { agent as agentConfig } from '../config';
import { channelContext } from '../lib/context';
import { input, output } from '../types/tools/index';
import { isAgentSchedule } from './scheduled-tasks/queries';

export const waitTool = createTool({
  id: 'wait',
  description:
    "Pause the conversation and automatically resume it later, without blocking. Use for one-time delays, spaced-out polling, or giving a background job or external event time to progress. Before calling this, send a short text message telling the user what you're waiting for; the typing status clears the moment your turn ends, so that message is the only lasting sign you're still on it. Call this last and then stop; you will be woken up automatically when the wait is over. Calling it always ends your turn, the same as skip. For recurring work, use create_scheduled_task instead.",
  inputSchema: input({
    seconds: z.number().int().min(1).describe('How many seconds to wait.'),
    reason: z
      .string()
      .min(1)
      .describe('What you are waiting for, and what to do once it resumes.'),
  }),
  outputSchema: output({ seconds: z.number() }),
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
        'Could not resolve this conversation to a memory thread yet. Send another message and try again.'
      );
    }
    const threadId = context.agent?.threadId;
    const memoryResourceId = context.agent?.resourceId;
    if (!(threadId && memoryResourceId)) {
      throw new Error('No current Slack thread/resource to wait in.');
    }

    const previous = await schedules.list({
      agentId: agentConfig.id,
      threadId,
    });
    await Promise.all(
      previous
        .filter(
          (task) =>
            isAgentSchedule(task) &&
            task.metadata?.kind === 'wait' &&
            task.lastFireAt !== undefined
        )
        .map((task) => schedules.delete(task.id))
    );

    const fireAt = new Date(Date.now() + seconds * 1000);
    if (Number.isNaN(fireAt.getTime()) || fireAt.getUTCFullYear() > 9999) {
      throw new Error(
        'That wait is outside the scheduler supported date range.'
      );
    }
    const cron = `${fireAt.getUTCSeconds()} ${fireAt.getUTCMinutes()} ${fireAt.getUTCHours()} ${fireAt.getUTCDate()} ${fireAt.getUTCMonth() + 1} *`;

    await schedules.create({
      agentId: agentConfig.id,
      cron,
      timezone: 'UTC',
      prompt: `Your ${seconds}s wait is over (waiting for: ${reason}). Continue and respond in this same Slack conversation with the result.`,
      threadId,
      resourceId: memoryResourceId,
      signalType: 'notification',
      tagName: 'wait-resume',
      ifActive: { behavior: 'persist' },
      ifIdle: {
        behavior: 'wake',
        streamOptions: {
          requestContext: { channel: channelContext(context.requestContext) },
        },
      },
      metadata: { kind: 'wait' },
    });

    return {
      seconds,
    };
  },
});
