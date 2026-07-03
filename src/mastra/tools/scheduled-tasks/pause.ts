import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { findOwnedTask, heartbeats, taskScope } from './queries';
import { formatTask } from './utils';

export const pauseScheduledTaskTool = createTool({
  id: 'pause_scheduled_task',
  description:
    'Temporarily stop a recurring scheduled task without deleting it.',
  inputSchema: z.object({
    id: z.string().min(1).describe('Scheduled task id.'),
  }),
  execute: async ({ id }, context) => {
    const service = heartbeats(context);
    await findOwnedTask(service, { id, ...taskScope(context) });
    const updated = await service.pause(id);

    return {
      success: true,
      task: formatTask(updated),
      message: `Paused scheduled task ${id}.`,
    };
  },
});
