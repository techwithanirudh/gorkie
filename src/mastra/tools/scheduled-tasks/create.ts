import { createTool } from '@mastra/core/tools';
import { computeNextFireAt } from '@mastra/core/workflows';
import { z } from 'zod';
import { agent as agentConfig, scheduledTasks } from '../../config';
import { channelContext } from '../../lib/context';
import { isScheduledTask, ownSchedules } from './queries';

const minMinutes = scheduledTasks.minInterval / 60_000;

function assertMinimumInterval({
  cron,
  timezone,
}: {
  cron: string;
  timezone?: string;
}): void {
  let previous = computeNextFireAt(cron, { timezone });
  for (let i = 1; i < 5; i += 1) {
    let fire: number;
    try {
      fire = computeNextFireAt(cron, { timezone, after: previous });
    } catch {
      break;
    }
    const gap = fire - previous;
    if (gap < scheduledTasks.minInterval) {
      throw new Error(
        `That schedule fires every ${Math.round(gap / 60_000)} minutes. Minimum interval is ${minMinutes} minutes.`
      );
    }
    previous = fire;
  }
}

export const createScheduledTaskTool = createTool({
  id: 'create_scheduled_task',
  description: `Create a recurring schedule for the current Slack conversation. Use a valid cron expression and optional IANA timezone. Minimum interval is ${minMinutes} minutes between fires, each run costs model credits: never request a faster cadence, refuse and offer the nearest ${minMinutes}-minute-or-slower option instead.`,
  inputSchema: z.strictObject({
    task: z.string().min(1).describe('Prompt to run on the schedule.'),
    cron: z
      .string()
      .min(1)
      .describe(
        `Cron expression for when to run. Minimum interval: ${minMinutes} minutes between fires.`
      ),
    name: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe('Short human-readable name for the schedule.'),
    timezone: z
      .string()
      .min(1)
      .optional()
      .describe('IANA timezone, such as America/New_York.'),
  }),
  outputSchema: z.strictObject({ schedule: z.unknown() }),
  execute: async ({ task, cron, name, timezone }, context) => {
    const { resourceId, service } = ownSchedules(context);
    const threadId = context.agent?.threadId;
    if (!threadId) {
      throw new Error('No current Slack thread to schedule into.');
    }

    assertMinimumInterval({ cron, timezone });
    const active = (
      await service.list({ agentId: agentConfig.id, resourceId })
    ).filter(isScheduledTask);
    if (active.length >= scheduledTasks.maxActivePerUser) {
      throw new Error(
        `You already have ${active.length} scheduled tasks, the most allowed. Delete one first.`
      );
    }

    return {
      schedule: await service.create({
        agentId: agentConfig.id,
        cron,
        prompt: task,
        threadId,
        resourceId,
        signalType: 'notification',
        ifActive: { behavior: 'persist' },
        ifIdle: {
          behavior: 'wake',
          streamOptions: {
            requestContext: { channel: channelContext(context.requestContext) },
          },
        },
        ...(name ? { name } : {}),
        ...(timezone ? { timezone } : {}),
      }),
    };
  },
});
