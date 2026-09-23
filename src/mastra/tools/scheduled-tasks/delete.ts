import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ownedScheduleService } from './queries';

export const deleteScheduledTaskTool = createTool({
  id: 'delete_scheduled_task',
  description: 'Permanently delete a recurring schedule.',
  inputSchema: z.strictObject({
    id: z.string().min(1).describe('Schedule ID.'),
  }),
  outputSchema: z.strictObject({ id: z.string() }),
  execute: async ({ id }, context) => {
    const service = await ownedScheduleService({ context, id });
    await service.delete(id);
    return { id };
  },
});
