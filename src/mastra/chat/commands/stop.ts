import { agent as agentConfig } from '../../config';
import { logger } from '../../lib/logger';
import type { CommandHandler } from '../../types';
import { getMastra } from '../mastra-instance';

export const stop: CommandHandler = async ({ message, thread }) => {
  const orchestrator = getMastra().getAgentById(agentConfig.id);
  // A thread with no memory yet has never run a turn, so there is nothing to stop.
  const threadMemory = await orchestrator
    .getMemory()
    .then((memory) =>
      memory?.listThreads({
        filter: { metadata: { channel_externalThreadId: thread.id } },
        perPage: 1,
      })
    )
    .then((found) => found?.threads[0])
    .catch((error: unknown) => {
      logger.warn('[commands] Failed to look up the memory thread to stop', {
        error,
        threadId: thread.id,
      });
    });
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
