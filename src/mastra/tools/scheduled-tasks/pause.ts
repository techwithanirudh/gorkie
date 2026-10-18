import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { agent as agentConfig } from '../../config';
import { input, output } from '../../types/tools/index';

export const pauseScheduledTaskTool = createTool({
  id: 'pause_scheduled_task',
  description: 'Pause a recurring schedule without deleting it.',
  inputSchema: input({ id: z.string().min(1).describe('Schedule ID.') }),
  outputSchema: output({ schedule: z.unknown() }),
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

    return { schedule: await service.pause(id) };
  },
});
