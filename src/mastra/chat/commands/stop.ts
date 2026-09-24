import { agent as agentConfig } from '../../config';
import { logger } from '../../lib/logger';
import type { CommandHandler } from '../../types';
import { killJobs } from '../../workspace/jobs';
import { getMastra } from '../mastra-instance';
import { memoryThread } from '../memory-thread';
import { notify } from '../notify';
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
  let threadId = slackThreadId;
  try {
    const found = await memoryThread(slackThreadId);
    if (found) {
      threadId = found.thread.id;
    }
  } catch (error) {
    logger.warn('[commands] failed to look up the memory thread to stop', {
      error,
      threadId: slackThreadId,
    });
  }

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
          logger.warn('[commands] failed to list background tasks to stop', {
            error,
            threadId,
          });
          return [];
        })
    : [];

  const killed = await killJobs(slackThreadId);
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
    logger.warn('[commands] some background tasks failed to stop', {
      threadId,
    });
  }

  if (runs.length > 0) {
    return 'aborted';
  }
  return backgroundTasks.length > 0 || killed > 0 ? 'cancelled' : 'idle';
}

export const stop: CommandHandler = async ({ message, thread }) => {
  const outcome = await stopThread(thread.id);
  if (outcome === 'aborted') {
    return;
  }
  if (outcome === 'cancelled') {
    await thread.post({ markdown: '_stopped._' }).catch((error: unknown) => {
      logger.warn('[commands] failed to post stop confirmation', {
        error,
        threadId: thread.id,
      });
    });
    return;
  }
  await notify({
    text: 'nothing to stop right now.',
    thread,
    user: message.author,
  });
};
