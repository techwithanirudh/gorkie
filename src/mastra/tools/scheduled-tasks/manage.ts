import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { isScheduledTask, ownSchedules } from './schedules';

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
    outputSchema: z.strictObject({ schedule: z.unknown() }),
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
        return { schedule };
      }
      return { schedule: await service[action](scheduleId) };
    },
  });
}
