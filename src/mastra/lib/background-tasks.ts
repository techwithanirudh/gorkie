import { getMastra } from '../chat/mastra-instance';
import type { ChannelContext } from '../types';
import { logger } from './logger';

// A task is still gorkie's problem until it reaches a terminal state, so the
// turn footer and the sandbox pause both read this and must agree on the set.
const ACTIVE = ['pending', 'running', 'suspended'] as const;

export async function threadHasBackgroundTask(
  threadId: string
): Promise<boolean> {
  try {
    const tasks = await getMastra().backgroundTaskManager?.listTasks({
      status: [...ACTIVE],
      threadId,
    });
    return (tasks?.total ?? 0) > 0;
  } catch (error) {
    logger.debug('[background] could not check tasks', { error, threadId });
    return false;
  }
}

// `onTaskComplete` receives only a `BackgroundTask`, whose `threadId` is the
// memory thread, not the Slack `slack:C…:ts` a woken run needs to render into.
// Stash the dispatching turn's channel context against that memory thread so
// the completion wake can carry it, the way `wait` and `create_scheduled_task`
// already do. Keyed by memory thread because that is the one id both sides see.
const MAX_TRACKED = 200;
const channels = new Map<string, ChannelContext>();

export function rememberThreadChannel({
  channel,
  memoryThreadId,
}: {
  channel: ChannelContext;
  memoryThreadId: string | undefined;
}): void {
  if (!(memoryThreadId && channel.threadId)) {
    return;
  }
  // Re-insert so the eviction order below stays least-recently-used.
  channels.delete(memoryThreadId);
  if (channels.size >= MAX_TRACKED) {
    const oldest = channels.keys().next().value;
    if (oldest !== undefined) {
      channels.delete(oldest);
    }
  }
  channels.set(memoryThreadId, channel);
}

export function recallThreadChannel(
  memoryThreadId: string
): ChannelContext | undefined {
  return channels.get(memoryThreadId);
}
