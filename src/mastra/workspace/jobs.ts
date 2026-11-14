import type { ProcessHandle } from '@mastra/core/workspace';
import { logger } from '../lib/logger';

interface Job {
  description: string;
  done: Promise<boolean>;
  handle: ProcessHandle;
  startedAt: number;
}

const jobs = new Map<string, Map<string, Job>>();

export function trackJob({
  description,
  handle,
  threadId,
}: {
  description: string;
  handle: ProcessHandle;
  threadId: string;
}): void {
  const running = jobs.get(threadId) ?? new Map<string, Job>();
  const done = handle.wait().then(
    (result) => result.success,
    () => false
  );
  running.set(handle.pid, {
    description,
    done,
    handle,
    startedAt: Date.now(),
  });
  jobs.set(threadId, running);
  const forget = () => {
    running.delete(handle.pid);
    if (running.size === 0 && jobs.get(threadId) === running) {
      jobs.delete(threadId);
    }
  };
  done.then(forget, forget);
}

export function threadJobs(threadId: string): Job[] {
  return [...(jobs.get(threadId)?.values() ?? [])];
}

export function runningJobs(threadId: string | undefined): number {
  return threadId ? (jobs.get(threadId)?.size ?? 0) : 0;
}

export async function killJobs(threadId: string): Promise<number> {
  const running = threadJobs(threadId);
  const killed = await Promise.allSettled(
    running.map((job) => job.handle.kill())
  );
  if (killed.some(({ status }) => status === 'rejected')) {
    logger.warn('[sandbox] some jobs failed to stop', { threadId });
  }
  return running.length;
}
