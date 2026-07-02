import type { MastraUnion } from '@mastra/core/tools';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { channelContext } from '../../lib/context';
import { canAccessTask, requireResourceId } from './queries';
import { AGENT_ID, formatTask, scheduledTaskKind } from './utils';

export const listScheduledTasksTool = createTool({
  id: 'list_scheduled_tasks',
  description:
    'List recurring scheduled tasks. Use before pausing, resuming, or deleting one if the target id is unclear.',
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const service = (context?.mastra as MastraUnion).heartbeats;
    const resourceId = requireResourceId(context.agent?.resourceId);
    const threadId = channelContext(context?.requestContext).threadId;
    const tasks = await service.list({ agentId: AGENT_ID });
    const visible = tasks.filter(
      (task) =>
        task.metadata?.kind === scheduledTaskKind &&
        canAccessTask(task, { resourceId, threadId })
    );

    return {
      success: true,
      count: visible.length,
      tasks: visible.map(formatTask),
      message:
        visible.length === 0
          ? 'No recurring scheduled tasks found.'
          : `Found ${visible.length} recurring scheduled task${visible.length === 1 ? '' : 's'}.`,
    };
  },
});
