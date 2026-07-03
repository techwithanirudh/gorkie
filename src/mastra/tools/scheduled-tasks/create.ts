import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { channelContext } from '../../lib/context';
import { heartbeats } from './queries';
import { AGENT_ID, formatTask, scheduledTaskKind } from './utils';

export const createScheduledTaskTool = createTool({
  id: 'create_scheduled_task',
  description:
    'Create a recurring scheduled task from a cron expression. The task runs where it was scheduled: the current Slack thread, DM, or channel.',
  inputSchema: z.object({
    task: z
      .string()
      .min(1)
      .describe('The recurring task to perform when the schedule fires.'),
    cron: z
      .string()
      .min(1)
      .describe('Cron expression for the recurring schedule.'),
    timezone: z
      .string()
      .min(1)
      .optional()
      .describe('IANA timezone, such as America/New_York.'),
    name: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe('Short human-readable label for the task.'),
  }),
  execute: async (input, context) => {
    const service = heartbeats(context);
    const ctx = channelContext(context?.requestContext);
    const resourceId = context.agent?.resourceId;
    const threadId = ctx.threadId;
    if (!(threadId && resourceId)) {
      throw new Error('No current Slack thread/resource to schedule into.');
    }

    const created = await service.create({
      agentId: AGENT_ID,
      cron: input.cron,
      prompt: `Scheduled task due now. Task: ${input.task}\n\nRespond in this same Slack conversation with the result.`,
      ...(input.name ? { name: input.name } : {}),
      ...(input.timezone ? { timezone: input.timezone } : {}),
      threadId,
      resourceId,
      tagName: 'scheduled-task',
      ifActive: { behavior: 'persist' },
      ifIdle: {
        behavior: 'wake',
        streamOptions: {
          requestContext: context.requestContext?.toJSON(),
        },
      },
      metadata: {
        kind: scheduledTaskKind,
        task: input.task,
        createdBy: ctx.userId,
        createdIn: {
          channelId: ctx.channelId,
          isDM: ctx.isDM,
          threadId,
        },
      },
    });

    return {
      success: true,
      task: formatTask(created),
      message: `Recurring scheduled task created: ${created.id}.`,
    };
  },
});
