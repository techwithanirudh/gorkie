import { Memory } from '@mastra/memory';
import { agent as agentConfig } from '../../config';
import { logger } from '../../lib/logger';
import type { CommandHandler } from '../../types';
import { getMastra } from '../mastra-instance';
import { memoryThread } from '../memory-thread';

async function compactThread(slackThreadId: string): Promise<string> {
  const found = await memoryThread(slackThreadId);
  const om =
    found?.memory instanceof Memory ? await found.memory.omEngine : null;
  if (!(found && om)) {
    return 'nothing to compact in this thread yet.';
  }
  const { id: threadId, resourceId } = found.thread;
  const busy = getMastra()
    .getAgentById(agentConfig.id)
    .listActiveThreadRuns()
    .some((run) => run.threadId === threadId);
  if (busy) {
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

export const compact: CommandHandler = async ({ message, thread }) => {
  const text = await compactThread(thread.id).catch((error: unknown) => {
    logger.error('[commands] compact failed', { error, threadId: thread.id });
    return "i couldn't compact this thread just now. try again in a minute.";
  });
  await thread
    .postEphemeral(message.author, text, { fallbackToDM: false })
    .catch((error: unknown) => {
      logger.warn('[commands] failed to post compact result', {
        error,
        threadId: thread.id,
      });
    });
};
