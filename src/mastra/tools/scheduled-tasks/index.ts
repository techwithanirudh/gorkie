import { createScheduledTaskTool } from './create';
import { deleteScheduledTaskTool } from './delete';
import { listScheduledTasksTool } from './list';
import { pauseScheduledTaskTool } from './pause';
import { resumeScheduledTaskTool } from './resume';

export const scheduledTaskTools = {
  create_scheduled_task: createScheduledTaskTool,
  list_scheduled_tasks: listScheduledTasksTool,
  pause_scheduled_task: pauseScheduledTaskTool,
  resume_scheduled_task: resumeScheduledTaskTool,
  delete_scheduled_task: deleteScheduledTaskTool,
};
