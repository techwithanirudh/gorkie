import { Memory } from '@mastra/memory';
import { agent as agentConfig } from '../../config';
import { logger } from '../../lib/logger';
import type { CommandHandler } from '../../types';
import { getMastra } from '../mastra-instance';

async function compactThread(slackThreadId: string): Promise<string> {
  const agent = getMastra().getAgentById(agentConfig.id);
  const memory = await agent.getMemory();
  const om = memory instanceof Memory ? await memory.omEngine : null;
  if (!(memory && om)) {
    return 'nothing to compact in this thread yet.';
  }
  // Channels falls back to a generated thread id on a collision, but always
  // records the Slack thread id in metadata.
  const {
    threads: [thread],
  } = await memory.listThreads({
    filter: { metadata: { channel_externalThreadId: slackThreadId } },
    perPage: 1,
  });
  if (!thread) {
    return 'nothing to compact in this thread yet.';
  }
  const { id: threadId, resourceId } = thread;
  if (agent.listActiveThreadRuns().some((run) => run.threadId === threadId)) {
    return "i'm still replying here. wait for me to finish, or `!stop` me, then compact.";
  }
  const before = (await om.getRecord(threadId, resourceId))
    ?.observationTokenCount;
  // observe() only folds in new messages once they pass the observation
  // threshold; reflect() then condenses whatever the log already holds.
  const observed = await om.observe({ threadId, resourceId });
  const reflected = observed.reflected
    ? observed
    : await om.reflect(threadId, resourceId);
  if (!(observed.observed || reflected.reflected)) {
    return 'nothing to compact in this thread yet.';
  }
  const after = reflected.record.observationTokenCount;
  return before
    ? `compacted this thread's memory from about ${before.toLocaleString()} to ${after.toLocaleString()} tokens.`
    : `compacted this thread's memory to about ${after.toLocaleString()} tokens.`;
}

// Runs detached because compaction makes slow model calls, and awaiting here
// would hold the thread lock and queue !stop behind it.
export const compact: CommandHandler = ({ message, thread }) => {
  compactThread(thread.id)
    .catch((error: unknown) => {
      logger.error('[commands] compact failed', { error, threadId: thread.id });
      return "i couldn't compact this thread just now. try again in a minute.";
    })
    .then((text) =>
      thread.postEphemeral(message.author, text, { fallbackToDM: false })
    )
    .catch((error: unknown) => {
      logger.warn('[commands] failed to post compact result', {
        error,
        threadId: thread.id,
      });
    });
  return Promise.resolve();
};
