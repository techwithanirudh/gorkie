import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { findOwnedTask, heartbeats, taskScope } from './queries';

export const deleteScheduledTaskTool = createTool({
  id: 'delete_scheduled_task',
  description: 'Permanently cancel a recurring scheduled task.',
  inputSchema: z.object({
    id: z.string().min(1).describe('Scheduled task id.'),
  }),
  execute: async ({ id }, context) => {
    const service = heartbeats(context);
    await findOwnedTask(service, { id, ...taskScope(context) });
    await service.delete(id);

    return {
      success: true,
      id,
      message: `Deleted scheduled task ${id}.`,
    };
  },
});
