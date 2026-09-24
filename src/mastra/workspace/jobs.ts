import type { E2BSandbox } from '@mastra/e2b';
import { sandbox as config } from '../config';
import { logger } from '../lib/logger';

interface BackgroundJob {
  attachPid: (pid: string) => void;
  attachSandbox: (sandbox: E2BSandbox) => void;
  end: () => void;
}

const jobs = new Map<
  string,
  { threadId: string; deadline: number; sandbox?: E2BSandbox; pid?: string }
>();
const keepalives = new Map<string, ReturnType<typeof setInterval>>();

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
      const now = Date.now();
      for (const [jobId, job] of jobs) {
        if (job.deadline <= now) {
          jobs.delete(jobId);
        }
      }
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
  const running = [...jobs].flatMap(
    ([id, { threadId: owner, pid, sandbox }]) =>
      owner === threadId && pid && sandbox ? [{ id, pid, sandbox }] : []
  );
  const kills = await Promise.allSettled(
    running.map(({ id, pid, sandbox }) => {
      jobs.delete(id);
      return sandbox.processes.kill(pid);
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
