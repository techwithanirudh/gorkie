import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { input, output } from '../../types/tools/index';
import { ownedScheduleService } from './queries';

export const deleteScheduledTaskTool = createTool({
  id: 'delete_scheduled_task',
  description: 'Permanently delete a recurring schedule.',
  inputSchema: input({ id: z.string().min(1).describe('Schedule ID.') }),
  outputSchema: output({ id: z.string() }),
  execute: async ({ id }, context) => {
    const service = await ownedScheduleService({ context, id });
    await service.delete(id);
    return { id };
  },
});
