import type { Heartbeat, Heartbeats } from '@mastra/core/agent';
import { agent } from '../../config';
import { channelContext } from '../../lib/context';
import type { TaskToolContext } from '../../types';
import { scheduledTaskKind } from './utils';

export function heartbeats(context: TaskToolContext): Heartbeats {
  const service = context.mastra?.heartbeats;
  if (!service) {
    throw new Error('No Mastra instance available for scheduled tasks.');
  }
  return service;
}

export function taskScope(context: TaskToolContext): {
  resourceId: string;
  threadId?: string;
} {
  const resourceId = context.agent?.resourceId;
  if (!resourceId) {
    throw new Error('No current Slack user/resource to scope this to.');
  }
  return {
    resourceId,
    threadId: channelContext(context.requestContext).threadId,
  };
}

export function canViewTask(
  task: Heartbeat,
  { resourceId, threadId }: { resourceId: string; threadId?: string }
): boolean {
  const createdIn = task.metadata?.createdIn as
    | { threadId?: string }
    | undefined;

  return (
    task.resourceId === resourceId ||
    (!!threadId && createdIn?.threadId === threadId)
  );
}

export function canManageTask(
  task: Heartbeat,
  { resourceId }: { resourceId: string }
): boolean {
  return task.resourceId === resourceId;
}

export async function findOwnedTask(
  service: Heartbeats,
  { id, resourceId }: { id: string; resourceId: string }
): Promise<Heartbeat> {
  const current = await service.list({ agentId: agent.id });
  const task = current.find(
    (item) =>
      item.id === id &&
      item.metadata?.kind === scheduledTaskKind &&
      canManageTask(item, { resourceId })
  );
  if (!task) {
    throw new Error(
      `Scheduled task not found: ${id}. Only the task's creator can pause, resume, or delete it.`
    );
  }
  return task;
}
