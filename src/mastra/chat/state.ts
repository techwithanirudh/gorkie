import type { Thread } from 'chat';
import { logger } from '../lib/logger';
import { type ThreadState, threadStateSchema } from '../types';
import { getMastra } from './mastra-instance';

const stateType = 'gorkie:chat';

// Mastra's threadState domain, not Chat SDK `thread.state`: under channels'
// MastraStateAdapter that is an in-process cache, so every restart dropped
// whether a thread was being followed and where the history backfill stopped.
// Resolved through the Mastra instance so the call waits for storage init.
async function threadStateStore() {
  const store = await getMastra().getStorage()?.getStore('threadState');
  if (!store) {
    throw new Error('The threadState storage domain is not configured.');
  }
  return store;
}

export async function threadState(
  thread: Pick<Thread, 'id'>
): Promise<ThreadState | null> {
  try {
    const store = await threadStateStore();
    const stored = await store.getState({
      threadId: thread.id,
      type: stateType,
    });
    return threadStateSchema.safeParse(stored).data ?? null;
  } catch (error) {
    logger.error('[chat] failed to read thread state', {
      error,
      threadId: thread.id,
    });
    return null;
  }
}

export async function setThreadState({
  thread,
  patch,
}: {
  thread: Pick<Thread, 'id'>;
  patch: ThreadState;
}): Promise<void> {
  try {
    const store = await threadStateStore();
    // Read here rather than through threadState(), which turns a failed read
    // into null and would let this write drop the fields it did not patch.
    const stored = await store.getState({
      threadId: thread.id,
      type: stateType,
    });
    await store.setState({
      threadId: thread.id,
      type: stateType,
      value: { ...threadStateSchema.safeParse(stored).data, ...patch },
    });
  } catch (error) {
    logger.error('[chat] failed to save thread state', {
      error,
      threadId: thread.id,
    });
  }
}
