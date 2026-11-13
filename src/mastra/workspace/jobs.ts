import type { ProcessHandle } from '@mastra/core/workspace';
import { logger } from '../lib/logger';

const jobs = new Map<string, Map<string, ProcessHandle>>();

export function trackJob({
  handle,
  threadId,
}: {
  handle: ProcessHandle;
  threadId: string;
}): void {
  const running = jobs.get(threadId) ?? new Map<string, ProcessHandle>();
  running.set(handle.pid, handle);
  jobs.set(threadId, running);
  const forget = () => {
    running.delete(handle.pid);
    if (running.size === 0 && jobs.get(threadId) === running) {
      jobs.delete(threadId);
    }
  };
  handle.wait().then(forget, forget);
}

export function runningJobs(threadId: string | undefined): number {
  return threadId ? (jobs.get(threadId)?.size ?? 0) : 0;
}

export async function killJobs(threadId: string): Promise<number> {
  const running = [...(jobs.get(threadId)?.values() ?? [])];
  const killed = await Promise.allSettled(running.map((job) => job.kill()));
  if (killed.some(({ status }) => status === 'rejected')) {
    logger.warn('[sandbox] some jobs failed to stop', { threadId });
  }
  return running.length;
}
