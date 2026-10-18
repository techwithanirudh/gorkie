import { logger } from '../../lib/logger';
import { memoryThread } from '../../lib/memory';
import type { CommandHandler } from '../../types';

// 'aborted' means a live run was cancelled, and the agent's own onAbort posts
// about it; anything else is this command's to report. (Background-task
// cancellation lives on the background branch, where backgroundTasks is
// actually configured; this branch has no background tasks to stop.)
export async function stopThread(
  threadId: string
): Promise<'aborted' | 'idle'> {
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
  if (!(scope && activeRunId)) {
    return 'idle';
  }
  orchestrator.abortThreadStream(scope);
  return 'aborted';
}

export const stop: CommandHandler = async ({ message, thread }) => {
  const outcome = await stopThread(thread.id);
  if (outcome === 'aborted') {
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
