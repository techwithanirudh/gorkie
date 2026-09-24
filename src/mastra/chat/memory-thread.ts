import type { MastraMemory, StorageThreadType } from '@mastra/core/memory';
import { agent as agentConfig } from '../config';
import { getMastra } from './mastra-instance';

// Memory threads reuse the Slack thread id, except where core fell back to a
// generated id on a collision or the rename migration skipped the thread.
// Channels records the Slack id in metadata on all of them.
export async function memoryThread(
  slackThreadId: string
): Promise<{ memory: MastraMemory; thread: StorageThreadType } | undefined> {
  const memory = await getMastra().getAgentById(agentConfig.id).getMemory();
  if (!memory) {
    return;
  }
  const { threads } = await memory.listThreads({
    filter: { metadata: { channel_externalThreadId: slackThreadId } },
    perPage: 1,
  });
  const [thread] = threads;
  return thread ? { memory, thread } : undefined;
}
