import type { AgentSchedule } from '@mastra/core/schedules';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { agent } from '../../config';
import { canViewTask, isAgentSchedule, schedules, taskScope } from './queries';
import { formatTask, scheduledTaskKind } from './utils';

export const listScheduledTasksTool = createTool({
  id: 'list_scheduled_tasks',
  description:
    'List recurring scheduled tasks. Use before pausing, resuming, or deleting one if the target id is unclear.',
  inputSchema: z.object({}),
  execute: async (_input, context) => {
    const scope = taskScope(context);
    const tasks = await schedules(context).list({ agentId: agent.id });
    const visible = tasks.filter(
      (task): task is AgentSchedule =>
        isAgentSchedule(task) &&
        task.metadata?.kind === scheduledTaskKind &&
        canViewTask(task, scope)
    );

    return {
      success: true,
      count: visible.length,
      tasks: visible.map((task) => formatTask(task, scope.resourceId)),
      message:
        visible.length === 0
          ? 'No recurring scheduled tasks found.'
          : `Found ${visible.length} recurring scheduled task${visible.length === 1 ? '' : 's'}. Only the creator (canManage: true) can pause, resume, or delete each one.`,
    };
  },
});
