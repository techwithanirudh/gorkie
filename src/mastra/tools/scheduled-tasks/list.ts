import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { agent as agentConfig } from '../../config';
import { isScheduledTask, ownSchedules } from './schedules';

export const listScheduledTasksTool = createTool({
  id: 'list_scheduled_tasks',
  description:
    'List recurring schedules belonging to the current Slack conversation resource.',
  inputSchema: z.strictObject({}),
  outputSchema: z.strictObject({ schedules: z.array(z.unknown()) }),
  execute: async (_input, context) => {
    const { resourceId, service } = ownSchedules(context);
    const schedules = await service.list({
      agentId: agentConfig.id,
      resourceId,
    });
    return { schedules: schedules.filter(isScheduledTask) };
  },
});
