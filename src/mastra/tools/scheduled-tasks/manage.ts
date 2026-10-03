import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  isScheduledTask,
  ownSchedules,
  scheduleOutput,
  scheduleOutputSchema,
} from './schedules';

const pastTense = {
  delete: 'Deleted',
  pause: 'Paused',
  resume: 'Resumed',
} as const;

export function manageTool({
  id,
  description,
  action,
}: {
  id: string;
  description: string;
  action: 'delete' | 'pause' | 'resume';
}) {
  return createTool({
    id,
    description,
    inputSchema: z.strictObject({
      id: z.string().min(1).describe('Schedule ID.'),
    }),
    outputSchema: z.strictObject({ schedule: scheduleOutputSchema }),
    transform: {
      display: {
        output: ({ output }) => ({
          summary: `${pastTense[action]} ${output?.schedule.name ?? output?.schedule.id ?? 'schedule'}`,
        }),
      },
    },
    execute: async ({ id: scheduleId }, context) => {
      const { resourceId, service } = ownSchedules(context);
      const schedule = await service.get(scheduleId);
      if (
        !(schedule && isScheduledTask(schedule)) ||
        schedule.resourceId !== resourceId
      ) {
        throw new Error(
          `Schedule ${scheduleId} was not found in this conversation.`
        );
      }
      if (action === 'delete') {
        await service.delete(scheduleId);
        return { schedule: scheduleOutput(schedule) };
      }
      const { status, nextFireAt } = await service[action](scheduleId);
      return { schedule: scheduleOutput({ ...schedule, status, nextFireAt }) };
    },
  });
}
