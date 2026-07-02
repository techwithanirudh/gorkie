import type { MastraUnion } from '@mastra/core/tools';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { channelContext } from '../../lib/context';
import { findOwnedTask, requireResourceId } from './queries';

export const deleteScheduledTaskTool = createTool({
  id: 'delete_scheduled_task',
  description: 'Permanently cancel a recurring scheduled task.',
  inputSchema: z.object({
    id: z.string().min(1).describe('Scheduled task id.'),
  }),
  execute: async ({ id }, context) => {
    const service = (context?.mastra as MastraUnion).heartbeats;
    const resourceId = requireResourceId(context.agent?.resourceId);
    const threadId = channelContext(context?.requestContext).threadId;
    await findOwnedTask(service, { id, resourceId, threadId });
    await service.delete(id);

    return {
      success: true,
      id,
      message: `Deleted scheduled task ${id}.`,
    };
  },
});
