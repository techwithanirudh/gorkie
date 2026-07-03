import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { findOwnedTask, heartbeats, taskScope } from './queries';
import { formatTask } from './utils';

export const resumeScheduledTaskTool = createTool({
  id: 'resume_scheduled_task',
  description: 'Restart a paused recurring scheduled task.',
  inputSchema: z.object({
    id: z.string().min(1).describe('Scheduled task id.'),
  }),
  execute: async ({ id }, context) => {
    const service = heartbeats(context);
    await findOwnedTask(service, { id, ...taskScope(context) });
    const updated = await service.resume(id);

    return {
      success: true,
      task: formatTask(updated),
      message: `Resumed scheduled task ${id}.`,
    };
  },
});
