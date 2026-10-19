import { createScheduledTaskTool } from './create';
import { listScheduledTasksTool } from './list';
import { manageTool } from './manage';

export const scheduledTaskTools = {
  create_scheduled_task: createScheduledTaskTool,
  list_scheduled_tasks: listScheduledTasksTool,
  pause_scheduled_task: manageTool({
    id: 'pause_scheduled_task',
    description: 'Pause a recurring schedule without deleting it.',
    action: 'pause',
  }),
  resume_scheduled_task: manageTool({
    id: 'resume_scheduled_task',
    description: 'Resume a paused schedule in the current Slack conversation.',
    action: 'resume',
  }),
  delete_scheduled_task: manageTool({
    id: 'delete_scheduled_task',
    description: 'Permanently delete a recurring schedule.',
    action: 'delete',
  }),
};
