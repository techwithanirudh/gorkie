import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { agent as agentConfig } from '../../config';
import { input, output } from '../../types/tools/index';

export const deleteScheduledTaskTool = createTool({
  id: 'delete_scheduled_task',
  description: 'Permanently delete a recurring schedule.',
  inputSchema: input({ id: z.string().min(1).describe('Schedule ID.') }),
  outputSchema: output({ id: z.string() }),
  execute: async ({ id }, context) => {
    const service = context.mastra?.schedules;
    const { resourceId } = context.agent ?? {};
    if (!(service && resourceId)) {
      throw new Error('A resourceId is required to manage a schedule.');
    }
    const schedule = await service.get(id);
    if (
      !(schedule && 'agentId' in schedule) ||
      schedule.agentId !== agentConfig.id ||
      schedule.resourceId !== resourceId
    ) {
      throw new Error(`Schedule ${id} was not found in this conversation.`);
    }

    await service.delete(id);
    return { id };
  },
});
