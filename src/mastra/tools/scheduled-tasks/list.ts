import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { canAccessTask, heartbeats, taskScope } from './queries';
import { AGENT_ID, formatTask, scheduledTaskKind } from './utils';

export const listScheduledTasksTool = createTool({
  id: 'list_scheduled_tasks',
  description:
    'List recurring scheduled tasks. Use before pausing, resuming, or deleting one if the target id is unclear.',
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const scope = taskScope(context);
    const tasks = await heartbeats(context).list({ agentId: AGENT_ID });
    const visible = tasks.filter(
      (task) =>
        task.metadata?.kind === scheduledTaskKind && canAccessTask(task, scope)
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
