import { agent } from '../../config';
import { channelContext } from '../../lib/context';
import type { TaskToolContext } from '../../types';
import { type ScheduledTask, scheduledTaskKind } from './utils';

export interface ScheduledTaskService {
  create: (input: Record<string, unknown>) => Promise<ScheduledTask>;
  delete: (id: string) => Promise<unknown>;
  list: (input: { agentId: string }) => Promise<ScheduledTask[]>;
  pause: (id: string) => Promise<ScheduledTask>;
  resume: (id: string) => Promise<ScheduledTask>;
}

function isScheduledTask(value: unknown): value is ScheduledTask {
  return (
    !!value &&
    typeof value === 'object' &&
    'id' in value &&
    typeof value.id === 'string' &&
    'nextFireAt' in value &&
    (typeof value.nextFireAt === 'string' ||
      typeof value.nextFireAt === 'number' ||
      value.nextFireAt instanceof Date)
  );
}

function parseScheduledTask(value: unknown): ScheduledTask {
  if (!isScheduledTask(value)) {
    throw new Error('Mastra returned an invalid scheduled task.');
  }
  return value;
}

export function heartbeats(context: TaskToolContext): ScheduledTaskService {
  const { mastra } = context;
  if (!(mastra && 'heartbeats' in mastra)) {
    throw new Error('No Mastra instance available for scheduled tasks.');
  }
  const service = mastra.heartbeats;
  if (!(service && typeof service === 'object')) {
    throw new Error('No Mastra instance available for scheduled tasks.');
  }
  const create = 'create' in service ? service.create : undefined;
  const list = 'list' in service ? service.list : undefined;
  const pause = 'pause' in service ? service.pause : undefined;
  const resume = 'resume' in service ? service.resume : undefined;
  const deleteTask = 'delete' in service ? service.delete : undefined;
  if (
    typeof create !== 'function' ||
    typeof list !== 'function' ||
    typeof pause !== 'function' ||
    typeof resume !== 'function' ||
    typeof deleteTask !== 'function'
  ) {
    throw new Error('No Mastra instance available for scheduled tasks.');
  }
  return {
    create: async (input) => parseScheduledTask(await create(input)),
    list: async (input) => {
      const tasks = await list(input);
      if (!Array.isArray(tasks)) {
        throw new Error('Mastra returned an invalid scheduled task list.');
      }
      return tasks.map(parseScheduledTask);
    },
    pause: async (id) => parseScheduledTask(await pause(id)),
    resume: async (id) => parseScheduledTask(await resume(id)),
    delete: async (id) => deleteTask(id),
  };
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
  task: ScheduledTask,
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
  task: ScheduledTask,
  { resourceId }: { resourceId: string }
): boolean {
  return task.resourceId === resourceId;
}

export async function findOwnedTask(
  service: ScheduledTaskService,
  { id, resourceId }: { id: string; resourceId: string }
): Promise<ScheduledTask> {
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
