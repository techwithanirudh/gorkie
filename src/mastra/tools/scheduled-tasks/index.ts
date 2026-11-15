import { createScheduledTaskTool } from './create';
import { listScheduledTasksTool } from './list';
import { manageScheduledTaskTool } from './manage';

export const scheduledTaskTools = {
  create_scheduled_task: createScheduledTaskTool,
  list_scheduled_tasks: listScheduledTasksTool,
  manage_scheduled_task: manageScheduledTaskTool,
};
