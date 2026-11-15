import type { Agent } from '@mastra/core/agent';

export async function memoryThread({
  agent,
  externalThreadId,
}: {
  agent: Agent;
  externalThreadId: string;
}): Promise<{ id: string; resourceId?: string; title?: string } | undefined> {
  const memory = await agent.getMemory();
  const found = await memory?.listThreads({
    filter: { metadata: { channel_externalThreadId: externalThreadId } },
    perPage: 1,
  });
  return found?.threads[0];
}
