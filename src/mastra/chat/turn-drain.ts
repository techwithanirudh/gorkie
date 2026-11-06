import { setTimeout as sleep } from 'node:timers/promises';
import type { WorkerStopOptions } from '@mastra/core/worker';
import { MastraWorker } from '@mastra/core/worker';
import { agent as agentConfig, shutdown } from '../config';
import { logger } from '../lib/logger';

async function pollWhile<T>({
  check,
  intervalMs,
  until,
}: {
  check: () => Promise<T[]>;
  intervalMs: number;
  until: number;
}): Promise<T[]> {
  let pending = await check();
  while (pending.length > 0 && Date.now() < until) {
    // biome-ignore lint/performance/noAwaitInLoops: polling, each check has to wait for the last.
    await sleep(intervalMs);
    pending = await check();
  }
  return pending;
}

// Mastra's shutdown drains HTTP requests and workflow runs but not in-process
// agent streams, and stops workers before storage closes.
export class TurnDrainWorker extends MastraWorker {
  readonly name = 'turn-drain';
  #running = false;

  get isRunning(): boolean {
    return this.#running;
  }

  start(): Promise<void> {
    this.#running = true;
    return Promise.resolve();
  }

  async stop(options?: WorkerStopOptions): Promise<void> {
    this.#running = false;
    const drainTimeout = options?.drainTimeout ?? 0;
    const deadline = Date.now() + drainTimeout;
    const abortAt = deadline - Math.min(shutdown.abortLeadMs, drainTimeout / 2);
    const orchestrator = this.mastra?.getAgentById(agentConfig.id);
    if (!orchestrator) {
      return;
    }
    const running = async () => {
      const active = orchestrator.listActiveThreadRuns();
      const parked = await Promise.all(
        active.map((run) =>
          orchestrator
            .listSuspendedRuns({ threadId: run.threadId })
            .then(({ runs }) => runs.some(({ runId }) => runId === run.runId))
            // A run whose suspension cannot be checked is waited on as if it
            // were streaming: draining too long beats cutting a turn short.
            .catch((error: unknown) => {
              logger.debug('[shutdown] could not check a run for suspension', {
                error,
                threadId: run.threadId,
              });
              return false;
            })
        )
      );
      return active.filter((_, index) => !parked[index]);
    };

    logger.info('[shutdown] waiting for turns to finish', {
      timeoutMs: drainTimeout,
    });
    const pending = await pollWhile({
      check: running,
      intervalMs: 1000,
      until: abortAt,
    });
    if (pending.length === 0) {
      return;
    }

    logger.warn('[shutdown] aborting turns still running', {
      threads: pending.map(({ threadId }) => threadId),
    });
    for (const run of pending) {
      orchestrator.abortThreadStream({
        resourceId: run.resourceId,
        threadId: run.threadId,
      });
    }
    await pollWhile({ check: running, intervalMs: 250, until: deadline });
  }
}
