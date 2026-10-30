import { MastraStateAdapter } from '@mastra/core/channels';
import type { Lock, QueueEntry, StateAdapter } from 'chat';
import { getMastra } from './mastra-instance';
import { threadStateOrNull } from './state';

// Channels keeps its subscription flag in the memory thread's metadata, but
// agent runs rewrite that metadata wholesale (saveThread replaces the column)
// from a copy read before channels' unawaited subscribe() lands, so the flag
// is lost and follow-ups in a thread gorkie follows stop reaching it. The
// thread's own gorkie:chat state is never touched by those writes, so it
// decides following; the metadata flag still counts when it survives.
export class FollowingStateAdapter implements StateAdapter {
  private inner?: MastraStateAdapter;

  private async store(): Promise<MastraStateAdapter> {
    if (!this.inner) {
      const memory = await getMastra().getStorage()?.getStore('memory');
      if (!memory) {
        throw new Error('Channels require the memory storage domain.');
      }
      this.inner = new MastraStateAdapter(memory, () => 'orchestrator');
    }
    return this.inner;
  }

  async isSubscribed(threadId: string): Promise<boolean> {
    if (await (await this.store()).isSubscribed(threadId)) {
      return true;
    }
    const state = await threadStateOrNull({ id: threadId });
    return state?.respondOnThreadMessages === true;
  }

  async connect() {
    await (await this.store()).connect();
  }
  async disconnect() {
    await (await this.store()).disconnect();
  }
  async subscribe(threadId: string) {
    await (await this.store()).subscribe(threadId);
  }
  async unsubscribe(threadId: string) {
    await (await this.store()).unsubscribe(threadId);
  }
  async get<T = unknown>(key: string) {
    return (await this.store()).get<T>(key);
  }
  async set<T = unknown>(key: string, value: T, ttlMs?: number) {
    await (await this.store()).set(key, value, ttlMs);
  }
  async setIfNotExists(key: string, value: unknown, ttlMs?: number) {
    return (await this.store()).setIfNotExists(key, value, ttlMs);
  }
  async delete(key: string) {
    await (await this.store()).delete(key);
  }
  async appendToList(
    key: string,
    value: unknown,
    options?: { maxLength?: number; ttlMs?: number }
  ) {
    await (await this.store()).appendToList(key, value, options);
  }
  async getList<T = unknown>(key: string) {
    return (await this.store()).getList<T>(key);
  }
  async acquireLock(threadId: string, ttlMs: number) {
    return (await this.store()).acquireLock(threadId, ttlMs);
  }
  async releaseLock(lock: Lock) {
    await (await this.store()).releaseLock(lock);
  }
  async extendLock(lock: Lock, ttlMs: number) {
    return (await this.store()).extendLock(lock, ttlMs);
  }
  async forceReleaseLock(threadId: string) {
    await (await this.store()).forceReleaseLock(threadId);
  }
  async enqueue(threadId: string, entry: QueueEntry, maxSize: number) {
    return (await this.store()).enqueue(threadId, entry, maxSize);
  }
  async dequeue(threadId: string) {
    return (await this.store()).dequeue(threadId);
  }
  async queueDepth(threadId: string) {
    return (await this.store()).queueDepth(threadId);
  }
}
