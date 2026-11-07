import type { Thread } from 'chat';
import { logger } from '../lib/logger';
import { type ThreadState, threadStateSchema } from '../types/thread';
import { getMastra } from './mastra-instance';

const stateType = 'gorkie:chat';

// Mastra's threadState domain, because Chat SDK's thread.state is an in-process
// Map under channels' MastraStateAdapter and a restart empties it. The domain's
// types only name 'task' and 'goal', but it stores any type.
async function stateStore() {
  const store = await getMastra().getStorage()?.getStore('threadState');
  if (!store) {
    throw new Error('The threadState storage domain is not configured.');
  }
  return store;
}

// One process serves Slack, so this can answer reads and order writes.
const cache = new Map<string, ThreadState>();
const pendingWrites = new Map<string, Promise<void>>();

async function loadState(threadId: string): Promise<ThreadState> {
  const cached = cache.get(threadId);
  if (cached) {
    return cached;
  }
  const store = await stateStore();
  const stored = await store.getState({ threadId, type: stateType });
  const state = threadStateSchema.safeParse(stored ?? {}).data ?? {};
  cache.set(threadId, state);
  return state;
}

export async function threadState(
  thread: Pick<Thread, 'id'>
): Promise<ThreadState | null> {
  try {
    return await loadState(thread.id);
  } catch (error) {
    logger.error('[chat] failed to read thread state', {
      error,
      threadId: thread.id,
    });
    return null;
  }
}

export async function setThreadState({
  patch,
  thread,
}: {
  patch: ThreadState;
  thread: Pick<Thread, 'id'>;
}): Promise<void> {
  const previous = pendingWrites.get(thread.id);
  const write = (async () => {
    await previous;
    try {
      const value = { ...(await loadState(thread.id)), ...patch };
      const store = await stateStore();
      await store.setState({ threadId: thread.id, type: stateType, value });
      cache.set(thread.id, value);
    } catch (error) {
      logger.error('[chat] failed to save thread state', {
        error,
        threadId: thread.id,
      });
    }
  })();
  pendingWrites.set(thread.id, write);
  await write;
  if (pendingWrites.get(thread.id) === write) {
    pendingWrites.delete(thread.id);
  }
}
