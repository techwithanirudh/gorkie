import type { AgentSessionStoppedEvent } from 'chat';
import { logger } from '../../lib/logger';
import { memoryThread } from '../../lib/memory';
import type { CommandHandler } from '../../types';
import { killJobs } from '../../workspace/jobs';
import { chat } from '../instance';
import { getMastra } from '../mastra-instance';
import { notify } from '../notify';
import { setThreadState } from '../state';

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

async function stopThread(
  threadId: string
): Promise<'aborted' | 'cancelled' | 'idle'> {
  const { default: orchestrator } = await import('../../agents/orchestrator');
  const killed = await killJobs(threadId);
  const threadMemory = await memoryThread({
    agent: orchestrator,
    externalThreadId: threadId,
  });
  if (!threadMemory) {
    return killed > 0 ? 'cancelled' : 'idle';
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
  const active = Boolean(orchestrator.getActiveThreadRunId(scope));
  // Also between turns: the open untilIdle stream starts a follow-up turn when a
  // task ends, even a cancelled one, unless it is closed too.
  orchestrator.abortThreadStream({ ...scope, clearPendingSignals: true });
  if (active) {
    return 'aborted';
  }
  return cancelled > 0 || killed > 0 ? 'cancelled' : 'idle';
}

// Slack's own stop button on an agent session. The adapter only aborts Chat
// SDK's turn, which does not reach the Mastra run, its jobs or its subagents.
export async function onAgentSessionStopped(
  event: AgentSessionStoppedEvent
): Promise<void> {
  await setThreadState({
    thread: chat().thread(event.threadId),
    patch: { dropMessagesBefore: Date.now() },
  });
  await stopThread(event.threadId);
}

export const stop: CommandHandler = async ({ message, thread }) => {
  await setThreadState({
    thread,
    patch: { dropMessagesBefore: message.metadata.dateSent.getTime() },
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
  await notify({
    text: 'Nothing to stop right now.',
    thread,
    user: message.author,
  });
};
