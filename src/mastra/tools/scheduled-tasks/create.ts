import type { MastraUnion } from '@mastra/core/tools';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { targetSchema } from '../../chat/target';
import { channelContext } from '../../lib/context';
import { AGENT_ID, formatTask, scheduledTaskKind } from './utils';

export const createScheduledTaskTool = createTool({
  id: 'create_scheduled_task',
  description:
    'Create a recurring scheduled task from a cron expression. By default it replies in the thread it was scheduled from; pass target to deliver elsewhere (e.g. a DM or another channel).',
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
    target: targetSchema
      .optional()
      .describe(
        'Optional destination other than the thread this was scheduled from.'
      ),
  }),
  execute: async (input, context) => {
    // `context.mastra` is typed optional by the SDK, but every agent in this
    // app runs on the real Mastra instance (or Mastra's own ephemeral
    // fallback), so it's always populated here.
    const service = (context?.mastra as MastraUnion).heartbeats;
    const ctx = channelContext(context?.requestContext);
    const resourceId = context.agent?.resourceId;
    const threadId = ctx.threadId;
    if (!(threadId && resourceId)) {
      throw new Error('No current Slack thread/resource to schedule into.');
    }

    const delivery = input.target
      ? `Deliver the result with post_message to ${input.target.type} ${input.target.id}. Do not reply in this thread.`
      : 'Respond in this same Slack conversation with the result.';

    const created = await service.create({
      agentId: AGENT_ID,
      cron: input.cron,
      prompt: `Scheduled task due now. Task: ${input.task}\n\n${delivery}`,
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
        ...(input.target ? { target: input.target } : {}),
      },
    });

    return {
      success: true,
      task: formatTask(created),
      message: `Recurring scheduled task created: ${created.id}.`,
    };
  },
});
