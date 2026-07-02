import type { MastraUnion } from '@mastra/core/tools';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { channelContext } from '../../lib/context';
import { findOwnedTask, requireResourceId } from './queries';
import { formatTask } from './utils';

export const resumeScheduledTaskTool = createTool({
  id: 'resume_scheduled_task',
  description: 'Restart a paused recurring scheduled task.',
  inputSchema: z.object({
    id: z.string().min(1).describe('Scheduled task id.'),
  }),
  execute: async ({ id }, context) => {
    const service = (context?.mastra as MastraUnion).heartbeats;
    const resourceId = requireResourceId(context.agent?.resourceId);
    const threadId = channelContext(context?.requestContext).threadId;
    await findOwnedTask(service, { id, resourceId, threadId });
    const updated = await service.resume(id);

    return {
      success: true,
      task: formatTask(updated),
      message: `Resumed scheduled task ${id}.`,
    };
  },
});
