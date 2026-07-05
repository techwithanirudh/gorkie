import type { Heartbeat } from '@mastra/core/agent';

export const scheduledTaskKind = 'scheduled-task';

export function formatTask(
  task: Heartbeat,
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
