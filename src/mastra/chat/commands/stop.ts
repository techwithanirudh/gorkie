import { logger } from '../../lib/logger';
import { memoryThread } from '../../lib/memory';
import type { CommandHandler } from '../../types';

export const stop: CommandHandler = async ({ message, thread }) => {
  // Mark first: RFC i requires every later message in this thread to be
  // ignored even if aborting the current run below fails.
  await thread.setState({ stopped: true });

  const { default: orchestrator } = await import('../../agents/orchestrator');
  const threadMemory = await memoryThread({
    agent: orchestrator,
    externalThreadId: thread.id,
  }).catch(() => undefined);
  const scope = threadMemory
    ? { threadId: threadMemory.id, resourceId: threadMemory.resourceId }
    : undefined;
  const activeRunId = scope
    ? orchestrator.getActiveThreadRunId(scope)
    : undefined;
  const manager = orchestrator.getMastraInstance()?.backgroundTaskManager;
  const backgroundTasks = await (async () => {
    if (!(scope && manager)) {
      return [];
    }
    try {
      return (
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
        threadId: thread.id,
      });
      return [];
    }
  })();

  if (scope && activeRunId) {
    orchestrator.abortThreadStream(scope);
  }
  if (manager) {
    const cancellations = await Promise.allSettled(
      backgroundTasks.map((task) => manager.cancel(task.id))
    );
    if (cancellations.some(({ status }) => status === 'rejected')) {
      logger.warn('[commands] Some background tasks failed to stop', {
        threadId: thread.id,
      });
    }
  }
  await thread.post({ markdown: '_Stopped._' });
};
