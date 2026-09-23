import { logger } from '../../lib/logger';
import { memoryThread } from '../../lib/memory';
import type { CommandHandler } from '../../types';

export const stop: CommandHandler = async ({ message, thread }) => {
  // The orchestrator imports the chat handlers that reach this command, so a
  // static import here would be circular.
  const { default: orchestrator } = await import('../../agents/orchestrator');
  // A thread with no memory yet has never run a turn, so there is nothing to stop.
  const threadMemory = await memoryThread({
    agent: orchestrator,
    externalThreadId: thread.id,
  }).catch(() => undefined);
  const scope = threadMemory && {
    threadId: threadMemory.id,
    resourceId: threadMemory.resourceId,
  };
  if (scope && orchestrator.getActiveThreadRunId(scope)) {
    orchestrator.abortThreadStream(scope);
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
