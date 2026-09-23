import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ownedScheduleService } from './queries';

export const resumeScheduledTaskTool = createTool({
  id: 'resume_scheduled_task',
  description: 'Resume a paused schedule in the current Slack conversation.',
  inputSchema: z.strictObject({
    id: z.string().min(1).describe('Schedule ID.'),
  }),
  outputSchema: z.strictObject({ schedule: z.unknown() }),
  execute: async ({ id }, context) => {
    const service = await ownedScheduleService({ context, id });
    return { schedule: await service.resume(id) };
  },
});
