import type { E2BSandbox } from '@mastra/e2b';
import { sandbox as config } from '../config';
import { logger } from '../lib/logger';

// In memory on purpose: a restart loses the host side of every job anyway, and
// a thread with no entry pauses at turn end exactly as it did before.
const jobs = new Map<string, { threadId: string; deadline: number }>();
const keepalives = new Map<string, ReturnType<typeof setInterval>>();

export function hasLiveJob(threadId: string): boolean {
  const now = Date.now();
  let live = false;
  for (const [id, job] of jobs) {
    // Past its deadline the process has been killed by its own timeout, so a
    // lost exit callback cannot keep the VM up past the cap.
    if (job.deadline <= now) {
      jobs.delete(id);
    } else if (job.threadId === threadId) {
      live = true;
    }
  }
  return live;
}

export function startJob({
  id,
  threadId,
  sandbox,
  timeoutMs,
}: {
  id: string;
  threadId: string;
  sandbox: E2BSandbox;
  timeoutMs: number;
}): void {
  jobs.set(id, { threadId, deadline: Date.now() + timeoutMs });
  if (keepalives.has(threadId)) {
    return;
  }
  // The turn-end pause is skipped while a job runs, so nothing else refreshes
  // the VM lifetime; without this E2B pauses it under the job after 16 minutes.
  const timer = setInterval(() => {
    if (!hasLiveJob(threadId)) {
      clearInterval(timer);
      keepalives.delete(threadId);
      return;
    }
    sandbox.e2b.setTimeout(config.timeout).catch((error: unknown) => {
      logger.warn('[sandbox] failed to keep a background job alive', {
        error,
        threadId,
      });
    });
  }, config.background.keepaliveMs);
  timer.unref();
  keepalives.set(threadId, timer);
}

export function endJob(id: string): void {
  jobs.delete(id);
}
