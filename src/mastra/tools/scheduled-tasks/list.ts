import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { agent as agentConfig } from '../../config';
import { input, output } from '../../types/tools/index';

export const listScheduledTasksTool = createTool({
  id: 'list_scheduled_tasks',
  description:
    'List recurring schedules belonging to the current Slack conversation resource.',
  inputSchema: input({}),
  outputSchema: output({ schedules: z.array(z.unknown()) }),
  execute: async (_input, context) => {
    const service = context.mastra?.schedules;
    const resourceId = context.agent?.resourceId;
    if (!resourceId) {
      throw new Error('No current Slack resource to list schedules for.');
    }
    if (!service) {
      throw new Error('No Mastra schedule service is available.');
    }

    return {
      schedules: await service.list({
        agentId: agentConfig.id,
        resourceId,
      }),
    };
  },
});
