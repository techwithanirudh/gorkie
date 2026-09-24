import { agent as agentConfig } from '../../config';
import { logger } from '../../lib/logger';
import type { CommandHandler } from '../../types';
import { getMastra } from '../mastra-instance';
import { setThreadState } from '../state';

export async function stopThread(
  slackThreadId: string
): Promise<'aborted' | 'cancelled' | 'idle'> {
  await setThreadState({
    thread: { id: slackThreadId },
    patch: { dropMessagesBefore: Date.now() },
  });
  const mastra = getMastra();
  const orchestrator = mastra.getAgentById(agentConfig.id);
  // Memory threads reuse the Slack thread id, except where core fell back to a
  // generated id on a collision or the rename migration skipped the thread.
  // Channels records the Slack id in metadata on all of them.
  const threadMemory = await orchestrator
    .getMemory()
    .then((memory) =>
      memory?.listThreads({
        filter: { metadata: { channel_externalThreadId: slackThreadId } },
        perPage: 1,
      })
    )
    .then((found) => found?.threads[0])
    .catch((error: unknown) => {
      logger.warn('[commands] Failed to look up the memory thread to stop', {
        error,
        threadId: slackThreadId,
      });
    });
  const threadId = threadMemory?.id ?? slackThreadId;

  const runs = orchestrator
    .listActiveThreadRuns()
    .filter((run) => run.threadId === threadId);
  const manager = mastra.backgroundTaskManager;
  const backgroundTasks = manager
    ? await manager
        .listTasks({
          agentId: agentConfig.id,
          status: ['pending', 'running', 'suspended'],
          threadId,
        })
        .then(({ tasks }) => tasks)
        .catch((error: unknown) => {
          logger.warn('[commands] Failed to list background tasks to stop', {
            error,
            threadId,
          });
          return [];
        })
    : [];

  for (const run of runs) {
    orchestrator.abortThreadStream({
      resourceId: run.resourceId,
      threadId: run.threadId,
    });
  }
  const cancellations = await Promise.allSettled(
    backgroundTasks.map((task) => manager?.cancel(task.id))
  );
  if (cancellations.some(({ status }) => status === 'rejected')) {
    logger.warn('[commands] Some background tasks failed to stop', {
      threadId,
    });
  }

  if (runs.length > 0) {
    return 'aborted';
  }
  return backgroundTasks.length > 0 ? 'cancelled' : 'idle';
}

export const stop: CommandHandler = async ({ message, thread }) => {
  const outcome = await stopThread(thread.id);
  // An aborted run posts its own notice from the agent's onAbort.
  if (outcome === 'aborted') {
    return;
  }
  // Cancelling only background tasks fires no onAbort, so say it here.
  if (outcome === 'cancelled') {
    await thread.post({ markdown: '_stopped._' }).catch((error: unknown) => {
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
