import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ownedScheduleService } from './queries';

export const pauseScheduledTaskTool = createTool({
  id: 'pause_scheduled_task',
  description: 'Pause a recurring schedule without deleting it.',
  inputSchema: z.strictObject({
    id: z.string().min(1).describe('Schedule ID.'),
  }),
  outputSchema: z.strictObject({ schedule: z.unknown() }),
  execute: async ({ id }, context) => {
    const service = await ownedScheduleService({ context, id });
    return { schedule: await service.pause(id) };
  },
});
