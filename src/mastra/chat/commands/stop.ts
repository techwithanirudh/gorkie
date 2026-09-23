import { logger } from '../../lib/logger';
import { memoryThread } from '../../lib/memory';
import type { CommandHandler } from '../../types';

export async function stopThread(
  threadId: string
): Promise<'aborted-agent-notifies' | 'idle'> {
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
  return 'aborted-agent-notifies';
}

export const stop: CommandHandler = async ({ message, thread }) => {
  const outcome = await stopThread(thread.id);
  if (outcome === 'aborted-agent-notifies') {
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
