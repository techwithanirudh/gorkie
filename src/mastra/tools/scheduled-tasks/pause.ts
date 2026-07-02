import type { MastraUnion } from '@mastra/core/tools';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { channelContext } from '../../lib/context';
import { findOwnedTask, requireResourceId } from './queries';
import { formatTask } from './utils';

export const pauseScheduledTaskTool = createTool({
  id: 'pause_scheduled_task',
  description:
    'Temporarily stop a recurring scheduled task without deleting it.',
  inputSchema: z.object({
    id: z.string().min(1).describe('Scheduled task id.'),
  }),
  execute: async ({ id }, context) => {
    const service = (context?.mastra as MastraUnion).heartbeats;
    const resourceId = requireResourceId(context.agent?.resourceId);
    const threadId = channelContext(context?.requestContext).threadId;
    await findOwnedTask(service, { id, resourceId, threadId });
    const updated = await service.pause(id);

    return {
      success: true,
      task: formatTask(updated),
      message: `Paused scheduled task ${id}.`,
    };
  },
});
