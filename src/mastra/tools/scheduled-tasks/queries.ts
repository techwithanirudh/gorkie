import type { Heartbeat, Heartbeats } from '@mastra/core/agent';
import { AGENT_ID, scheduledTaskKind } from './utils';

export function requireResourceId(resourceId: string | undefined): string {
  if (!resourceId) {
    throw new Error('No current Slack user/resource to scope this to.');
  }
  return resourceId;
}

export function canAccessTask(
  task: Heartbeat,
  { resourceId, threadId }: { resourceId: string; threadId?: string }
): boolean {
  return (
    task.resourceId === resourceId || (!!threadId && task.threadId === threadId)
  );
}

export async function findOwnedTask(
  service: Heartbeats,
  {
    id,
    resourceId,
    threadId,
  }: { id: string; resourceId: string; threadId?: string }
): Promise<Heartbeat> {
  const current = await service.list({ agentId: AGENT_ID });
  const task = current.find(
    (item) =>
      item.id === id &&
      item.metadata?.kind === scheduledTaskKind &&
      canAccessTask(item, { resourceId, threadId })
  );
  if (!task) {
    throw new Error(`Scheduled task not found: ${id}`);
  }
  return task;
}
