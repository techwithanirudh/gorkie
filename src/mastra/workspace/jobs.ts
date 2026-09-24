import type { E2BSandbox } from '@mastra/e2b';
import { sandbox as config } from '../config';
import { logger } from '../lib/logger';
import type { BackgroundJob } from '../types';

const jobs = new Map<
  string,
  { threadId: string; deadline: number; sandbox?: E2BSandbox; pid?: string }
>();
const keepalives = new Map<string, ReturnType<typeof setInterval>>();

// TODO(slopradar): CODING_STANDARDS: inline over extract | pruneExpiredJobs has a single caller (the keepalive interval below) | inline the loop into the interval body
function pruneExpiredJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.deadline <= now) {
      jobs.delete(id);
    }
  }
}

export function hasLiveJob(threadId: string): boolean {
  const now = Date.now();
  return [...jobs.values()].some(
    (job) => job.threadId === threadId && job.deadline > now
  );
}

function jobHandle(id: string): BackgroundJob {
  return {
    attachSandbox: (sandbox) => {
      const job = jobs.get(id);
      if (job) {
        job.sandbox = sandbox;
      }
    },
    attachPid: (pid) => {
      const job = jobs.get(id);
      if (job) {
        job.pid = pid;
      }
    },
    end: () => {
      jobs.delete(id);
    },
  };
}

// Synchronous so a job is visible to the pause check before its caller's
// first await; attaching the sandbox and pid is only possible through the
// handle it returns.
export function startJob({
  id,
  threadId,
  sandbox,
  timeoutMs,
}: {
  id: string;
  threadId: string;
  sandbox?: E2BSandbox;
  timeoutMs: number;
}): BackgroundJob {
  jobs.set(id, { threadId, deadline: Date.now() + timeoutMs, sandbox });
  if (!keepalives.has(threadId)) {
    const timer = setInterval(() => {
      pruneExpiredJobs();
      if (!hasLiveJob(threadId)) {
        clearInterval(timer);
        keepalives.delete(threadId);
        return;
      }
      const sandbox = [...jobs.values()]
        .filter((job) => job.threadId === threadId && job.sandbox)
        .at(-1)?.sandbox;
      sandbox
        ?.retryOnDead(() => sandbox.e2b.setTimeout(config.timeout))
        .catch((error: unknown) => {
          logger.warn('[sandbox] failed to keep a background job alive', {
            error,
            threadId,
          });
        });
    }, config.background.keepaliveMs);
    timer.unref();
    keepalives.set(threadId, timer);
  }
  return jobHandle(id);
}

export function findJob(id: string): BackgroundJob | undefined {
  return jobs.has(id) ? jobHandle(id) : undefined;
}

export async function killJobs(threadId: string): Promise<number> {
  const running = [...jobs].filter(
    ([, job]) => job.threadId === threadId && job.pid && job.sandbox
  );
  const kills = await Promise.allSettled(
    running.map(([id, job]) => {
      jobs.delete(id);
      // TODO(slopradar): simplification: duplicate check | pid/sandbox are re-tested here only because the filter above does not narrow | build `running` with flatMap returning `{ id, pid, sandbox }` once, then map straight to processes.kill
      return job.pid && job.sandbox
        ? job.sandbox.processes.kill(job.pid)
        : false;
    })
  );
  for (const kill of kills) {
    if (kill.status === 'rejected') {
      logger.warn('[sandbox] failed to kill a background job', {
        error: kill.reason,
        threadId,
      });
    }
  }
  return running.length;
}
