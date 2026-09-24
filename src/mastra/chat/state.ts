import type { Message, Thread } from 'chat';
import { logger } from '../lib/logger';
import { type ThreadState, threadStateSchema } from '../types';
import { getMastra } from './mastra-instance';

const stateType = 'gorkie:chat';

// Mastra's threadState domain, not Chat SDK `thread.state`: under channels'
// MastraStateAdapter that is an in-process cache, so every restart dropped
// whether a thread was being followed and where the history backfill stopped.
async function threadStateStore() {
  const store = await getMastra().getStorage()?.getStore('threadState');
  if (!store) {
    throw new Error('The threadState storage domain is not configured.');
  }
  return store;
}

// Stored state that no longer matches the schema reads as empty for both the
// read and the write path, so a write replaces it instead of merging into it.
async function readThreadState(
  thread: Pick<Thread, 'id'>
): Promise<ThreadState | null> {
  const store = await threadStateStore();
  const stored = await store.getState({ threadId: thread.id, type: stateType });
  if (stored === null || stored === undefined) {
    return null;
  }
  const parsed = threadStateSchema.safeParse(stored);
  if (!parsed.success) {
    logger.warn('[chat] stored thread state did not match its shape', {
      issues: parsed.error.issues,
      threadId: thread.id,
    });
    return null;
  }
  return parsed.data;
}

export async function threadState(
  thread: Pick<Thread, 'id'>
): Promise<ThreadState | null> {
  try {
    return await readThreadState(thread);
  } catch (error) {
    logger.error('[chat] failed to read thread state', {
      error,
      threadId: thread.id,
    });
    return null;
  }
}

// Mastra's setState replaces the whole value, so two read-modify-writes on one
// thread would each restore the snapshot they read. One process serves Slack,
// so chaining writes per thread is enough.
const pendingWrites = new Map<string, Promise<void>>();

export async function setThreadState({
  thread,
  patch,
}: {
  thread: Pick<Thread, 'id'>;
  patch: ThreadState;
}): Promise<void> {
  const previous = pendingWrites.get(thread.id);
  const write = (async () => {
    await previous;
    // Unlike a read, a failed read here skips the write: writing the patch
    // alone would erase whatever the unreadable state held.
    try {
      const current = await readThreadState(thread);
      const store = await threadStateStore();
      await store.setState({
        threadId: thread.id,
        type: stateType,
        value: { ...current, ...patch },
      });
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

// A stop or leave_thread sets the cutoff, so anything sent before it was meant
// for the turn that got stopped.
export function sentBeforeStop({
  message,
  state,
}: {
  message: Message;
  state: ThreadState | null;
}): boolean {
  const cutoff = state?.dropMessagesBefore;
  return cutoff !== undefined && message.metadata.dateSent.getTime() < cutoff;
}
