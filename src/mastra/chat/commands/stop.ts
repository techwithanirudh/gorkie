import { logger } from '../../lib/logger';
import { memoryThread } from '../../lib/memory';
import type { CommandHandler } from '../../types';

// 'aborted' means a live run was cancelled, and the agent's own onAbort posts
// about it; anything else is this command's to report.
export async function stopThread(
  threadId: string
): Promise<'aborted' | 'cancelled' | 'idle'> {
  const { default: orchestrator } = await import('../../agents/orchestrator');
  const threadMemory = await memoryThread({
    agent: orchestrator,
    externalThreadId: threadId,
  }).catch(() => undefined);
  const scope = threadMemory
    ? { threadId: threadMemory.id, resourceId: threadMemory.resourceId }
    : undefined;
  const activeRunId = scope
    ? orchestrator.getActiveThreadRunId(scope)
    : undefined;
  const manager = orchestrator.getMastraInstance()?.backgroundTaskManager;

  let backgroundTasks: { id: string }[] = [];
  if (scope && manager) {
    try {
      backgroundTasks = (
        await manager.listTasks({
          agentId: orchestrator.id,
          threadId: scope.threadId,
          ...(scope.resourceId ? { resourceId: scope.resourceId } : {}),
          status: ['pending', 'running', 'suspended'],
        })
      ).tasks;
    } catch (error) {
      logger.warn('[commands] Failed to list background tasks for stop', {
        error,
        threadId,
      });
    }
  }

  if (!(scope && (activeRunId || backgroundTasks.length > 0))) {
    return 'idle';
  }
  if (activeRunId) {
    orchestrator.abortThreadStream(scope);
  }
  if (manager) {
    const cancellations = await Promise.allSettled(
      backgroundTasks.map((task) => manager.cancel(task.id))
    );
    if (cancellations.some(({ status }) => status === 'rejected')) {
      logger.warn('[commands] Some background tasks failed to stop', {
        threadId,
      });
    }
  }
  return activeRunId ? 'aborted' : 'cancelled';
}

export const stop: CommandHandler = async ({ message, thread }) => {
  const outcome = await stopThread(thread.id);
  if (outcome === 'aborted') {
    return;
  }
  if (outcome === 'cancelled') {
    await thread.post({ markdown: '_Stopped._' });
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
