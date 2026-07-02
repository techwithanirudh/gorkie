import type { Heartbeat } from '@mastra/core/agent';

export const AGENT_ID = 'gorkie';
export const scheduledTaskKind = 'gorkie-scheduled-task';

export function formatTask(task: Heartbeat): Record<string, unknown> {
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
    threadId: task.threadId,
    task: task.metadata?.task,
    target: task.metadata?.target,
  };
}
