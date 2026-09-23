import { createTool } from '@mastra/core/tools';
import { computeNextFireAt, validateCron } from '@mastra/core/workflows';
import { z } from 'zod';
import { agent as agentConfig, scheduledTasks } from '../../config';
import { channelContext } from '../../lib/context';
import { input, output } from '../../types/tools/index';

const minMinutes = scheduledTasks.minInterval / 60_000;

function assertMinimumInterval({
  cron,
  timezone,
}: {
  cron: string;
  timezone?: string;
}): void {
  validateCron(cron, timezone);
  let previous = computeNextFireAt(cron, { timezone });
  for (let i = 1; i < 5; i += 1) {
    let fire: number;
    try {
      fire = computeNextFireAt(cron, { timezone, after: previous });
    } catch {
      // A schedule with no further fire times cannot fire too often.
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
  description:
    minMinutes > 0
      ? `Create a recurring schedule for the current Slack conversation. Use a valid cron expression and optional IANA timezone. Minimum interval is ${minMinutes} minutes between fires, each run costs model credits: never request a faster cadence, refuse and offer the nearest ${minMinutes}-minute-or-slower option instead.`
      : 'Create a recurring schedule for the current Slack conversation. Use a valid cron expression and optional IANA timezone. No minimum interval in this environment; any cadence is allowed.',
  inputSchema: input({
    task: z.string().min(1).describe('Prompt to run on the schedule.'),
    cron: z
      .string()
      .min(1)
      .describe(
        minMinutes > 0
          ? `Cron expression for when to run. Minimum interval: ${minMinutes} minutes between fires.`
          : 'Cron expression for when to run. Any cadence is allowed in this environment.'
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
  outputSchema: output({ schedule: z.unknown() }),
  execute: async ({ task, cron, name, timezone }, context) => {
    const service = context.mastra?.schedules;
    const threadId = context.agent?.threadId;
    const resourceId = context.agent?.resourceId;
    if (!(threadId && resourceId)) {
      throw new Error('No current Slack thread/resource to schedule into.');
    }
    if (!service) {
      throw new Error('No Mastra schedule service is available.');
    }

    assertMinimumInterval({ cron, timezone });

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
