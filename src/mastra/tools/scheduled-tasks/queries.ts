import type { Heartbeat, Heartbeats } from '@mastra/core/agent';
import { channelContext } from '../../lib/context';
import type { TaskToolContext } from '../../types';
import { AGENT_ID, scheduledTaskKind } from './utils';

export function heartbeats(context: TaskToolContext): Heartbeats {
  const service = context.mastra?.heartbeats;
  if (!service) {
    throw new Error('No Mastra instance available for scheduled tasks.');
  }
  return service;
}

export async function resolveMemoryThread(
  context: TaskToolContext,
  externalThreadId: string
): Promise<{ id: string; resourceId?: string }> {
  const agent = context.mastra?.getAgentById(AGENT_ID);
  const memory = await agent?.getMemory();
  const found = await memory?.listThreads({
    filter: { metadata: { channel_externalThreadId: externalThreadId } },
    perPage: 1,
  });
  const thread = found?.threads[0];
  if (!thread) {
    throw new Error(
      'Could not resolve this conversation to a memory thread yet. Send another message and try again.'
    );
  }
  return thread;
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

export function canAccessTask(
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
