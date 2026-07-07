import type {
  AgentSchedule,
  AnySchedule,
  Schedules,
} from '@mastra/core/schedules';
import { agent } from '../../config';
import { channelContext } from '../../lib/context';
import type { TaskToolContext } from '../../types';
import { scheduledTaskKind } from './utils';

export function isAgentSchedule(
  schedule: AnySchedule
): schedule is AgentSchedule {
  return schedule.agentId !== undefined;
}

export function schedules(context: TaskToolContext): Schedules {
  const service = context.mastra?.schedules;
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
  task: AgentSchedule,
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
  task: AgentSchedule,
  { resourceId }: { resourceId: string }
): boolean {
  return task.resourceId === resourceId;
}

export async function findOwnedTask(
  service: Schedules,
  { id, resourceId }: { id: string; resourceId: string }
): Promise<AgentSchedule> {
  const current = await service.list({ agentId: agent.id });
  const task = current.find(
    (item): item is AgentSchedule =>
      item.id === id &&
      isAgentSchedule(item) &&
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
