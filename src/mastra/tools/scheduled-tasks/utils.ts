export const scheduledTaskKind = 'scheduled-task';

export interface ScheduledTask {
  cron?: string;
  id: string;
  lastFireAt?: string | number | Date;
  metadata?: Record<string, unknown>;
  name?: string;
  nextFireAt: string | number | Date;
  resourceId?: string;
  status?: string;
  threadId?: string;
  timezone?: string;
}

export function formatTask(
  task: ScheduledTask,
  currentResourceId?: string
): Record<string, unknown> {
  const createdIn = task.metadata?.createdIn as
    | { threadId?: string }
    | undefined;
  return {
    id: task.id,
    name: task.name,
    status: task.status,
    cron: task.cron,
    timezone: task.timezone,
    nextFireAt: new Date(task.nextFireAt).toISOString(),
    lastFireAt: task.lastFireAt
      ? new Date(task.lastFireAt).toISOString()
      : undefined,
    threadId: createdIn?.threadId ?? task.threadId,
    task: task.metadata?.task,
    createdBy: task.metadata?.createdBy,
    canManage: currentResourceId
      ? task.resourceId === currentResourceId
      : undefined,
  };
}
