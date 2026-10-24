import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { agent as agentConfig } from '../config';
import { wakes } from '../prompts/wakes';
import { waitInputSchema } from '../types/tools/wait';
import { channelWake, waitMetadata } from './scheduled-tasks/schedules';

export const waitTool = createTool({
  id: 'wait',
  description:
    'Pause the conversation and automatically resume it later, without blocking. Use for one-time delays, spaced polling, or giving a background job time to progress. The activity card retains your reason and delay as Waiting. Call this last and stop; do not call reply first, because reply ends the turn. Ordinary text is not delivered. For recurring work, use create_scheduled_task instead.',
  inputSchema: waitInputSchema,
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
      prompt: wakes.waitOver({ reason, seconds }),
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
