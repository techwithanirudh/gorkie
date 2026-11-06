import { logger } from '../../lib/logger';
import { memoryThread } from '../../lib/memory';
import type { CommandHandler } from '../../types';
import { getMastra } from '../mastra-instance';

async function cancelBackgroundTasks(threadId: string): Promise<number> {
  const manager = getMastra().backgroundTaskManager;
  if (!manager) {
    return 0;
  }
  const { tasks } = await manager.listTasks({
    status: ['pending', 'running', 'suspended'],
    threadId,
  });
  const cancelled = await Promise.allSettled(
    tasks.map((task) => manager.cancel(task.id))
  );
  if (cancelled.some(({ status }) => status === 'rejected')) {
    logger.warn('[commands] some background tasks failed to stop', {
      threadId,
    });
  }
  return tasks.length;
}

// 'aborted' means a live run was cancelled, and the agent's own onAbort posts
// about it. 'cancelled' means only background work was running, so nothing else
// tells the person it stopped.
export async function stopThread(
  threadId: string
): Promise<'aborted' | 'cancelled' | 'idle'> {
  const { default: orchestrator } = await import('../../agents/orchestrator');
  const threadMemory = await memoryThread({
    agent: orchestrator,
    externalThreadId: threadId,
  }).catch(() => undefined);
  if (!threadMemory) {
    return 'idle';
  }
  const scope = {
    threadId: threadMemory.id,
    resourceId: threadMemory.resourceId,
  };
  const cancelled = await cancelBackgroundTasks(threadMemory.id).catch(
    (error: unknown) => {
      logger.warn('[commands] failed to stop background tasks', {
        error,
        threadId,
      });
      return 0;
    }
  );
  if (orchestrator.getActiveThreadRunId(scope)) {
    orchestrator.abortThreadStream(scope);
    return 'aborted';
  }
  return cancelled > 0 ? 'cancelled' : 'idle';
}

export const stop: CommandHandler = async ({ message, thread }) => {
  // A failed write must not keep the stop from happening.
  await thread
    .setState({ dropMessagesBefore: message.metadata.dateSent.getTime() })
    .catch((error: unknown) => {
      logger.warn('[commands] failed to record the stop cutoff', {
        error,
        threadId: thread.id,
      });
    });
  const outcome = await stopThread(thread.id);
  if (outcome === 'aborted') {
    return;
  }
  if (outcome === 'cancelled') {
    await thread.post('_stopped._').catch((error: unknown) => {
      logger.warn('[commands] Failed to post stop confirmation', {
        error,
        threadId: thread.id,
      });
    });
    return;
  }
  await thread
    .postEphemeral(message.author, 'Nothing to stop right now.', {
      fallbackToDM: false,
    })
    .catch((error: unknown) => {
      logger.warn('[commands] Failed to post stop feedback', {
        error,
        threadId: thread.id,
        userId: message.author.userId,
      });
    });
};
