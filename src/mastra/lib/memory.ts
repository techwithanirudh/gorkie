import type { Agent } from '@mastra/core/agent';

export async function resolveMemoryThread(
  agent: Agent,
  externalThreadId: string
): Promise<{ id: string; resourceId?: string }> {
  const memory = await agent.getMemory();
  const found = await memory?.listThreads({
    filter: { metadata: { channel_externalThreadId: externalThreadId } },
    perPage: 1,
  });
  const thread = found?.threads[0];
  if (!thread) {
    throw new Error(
      'Could not resolve this conversation to a memory thread yet. Send another message and try again.'
    );
  }
  return thread;
}
