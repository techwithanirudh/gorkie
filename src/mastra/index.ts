import { join } from 'node:path';
import type { BackgroundTask } from '@mastra/core/background-tasks';
import { Mastra } from '@mastra/core/mastra';
import { SpanType } from '@mastra/core/observability';
import { RequestContext } from '@mastra/core/request-context';
import { MastraCompositeStore } from '@mastra/core/storage';
import { DuckDBStore } from '@mastra/duckdb';
import { LangfuseExporter } from '@mastra/langfuse';
import { MastraStorageExporter, Observability } from '@mastra/observability';
import { env } from '@/env';
import { exploreAgent as explore } from './agents/explore';
import orchestrator from './agents/orchestrator';
import { researchAgent as research } from './agents/research';
import { summarizer } from './agents/summarizer';
import { registerEvents } from './chat/events';
import { setChat } from './chat/instance';
import { setMastra } from './chat/mastra-instance';
import { postgresStore, runMigrations } from './db';
import { buildAllowlist } from './lib/allowed-users';
import { recallThreadChannel } from './lib/background-tasks';
import { logger } from './lib/logger';
import { LangfuseFeedbackExporter } from './observability/langfuse-feedback';
import { slackIdentity } from './observability/slack-identity';

process.on('unhandledRejection', (err: unknown) => {
  logger.error('[process] unhandled rejection', { err });
});
process.on('uncaughtException', (err: Error) => {
  logger.error('[process] uncaught exception', { err });
});

const isProduction = env.NODE_ENV === 'production';

// A background task finishes off-turn, and channels never passes `untilIdle`, so
// nothing would post its result. Wake the thread with a notification signal (the
// same idle-wake `wait` uses); the woken run reports the result to Slack.
async function notifyBackgroundTask(task: BackgroundTask): Promise<void> {
  if (!(task.threadId && task.resourceId)) {
    return;
  }
  const outcome =
    task.status === 'completed'
      ? 'finished'
      : `did not finish (${task.status}${task.error ? `: ${task.error.message}` : ''})`;
  // Without this the woken run has no Slack channel bound, so the workspace
  // resolver falls back to a scratch sandbox and nothing renders into the
  // thread. `task.threadId` is the memory thread, not the Slack one.
  const channel = recallThreadChannel(task.threadId);
  const streamOptions = channel
    ? { requestContext: new RequestContext([['channel', channel]]) }
    : undefined;
  try {
    await orchestrator
      .sendSignal(
        {
          type: 'notification',
          contents: `A background job (${task.toolName}) ${outcome}. Read its result from the tool output and report back to the user in this thread.`,
        },
        {
          threadId: task.threadId,
          resourceId: task.resourceId,
          ifIdle: { behavior: 'wake', ...(streamOptions && { streamOptions }) },
        }
      )
      .accepted.catch((error: unknown) => {
        logger.error('[background] wake signal rejected', {
          error,
          taskId: task.id,
        });
      });
  } catch (error) {
    logger.error('[background] failed to notify completion', {
      error,
      taskId: task.id,
    });
  }
}

export const mastra = new Mastra({
  agents: { orchestrator, summarizer, research, explore },
  backgroundTasks: {
    enabled: true,
    onTaskComplete: notifyBackgroundTask,
    onTaskFailed: notifyBackgroundTask,
  },
  schedules: {
    prepare: async ({ mastra: runtime, schedule }) => {
      const current = await runtime.schedules.get(schedule.id);
      if (current?.metadata?.kind === 'wait') {
        await runtime.schedules.delete(schedule.id);
      }
    },
  },
  storage: isProduction
    ? postgresStore
    : new MastraCompositeStore({
        id: 'composite-storage',
        default: postgresStore,
        domains: {
          observability: await new DuckDBStore({
            path: join(env.PROJECT_ROOT, 'observability.duckdb'),
          }).getStore('observability'),
        },
      }),
  observability: new Observability({
    configs: {
      default: {
        excludeSpanTypes: [
          SpanType.MAPPING,
          SpanType.MEMORY_OPERATION,
          SpanType.MODEL_STEP,
          SpanType.PROCESSOR_RUN,
          SpanType.SKILL_ACTION,
          SpanType.WORKSPACE_ACTION,
        ],
        serviceName: 'orchestrator',
        exporters: [
          ...(isProduction ? [] : [new MastraStorageExporter()]),
          ...(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY
            ? [
                new LangfuseFeedbackExporter(),
                new LangfuseExporter({
                  baseUrl: env.LANGFUSE_BASE_URL,
                  environment: env.NODE_ENV,
                  publicKey: env.LANGFUSE_PUBLIC_KEY,
                  realtime: !isProduction,
                  secretKey: env.LANGFUSE_SECRET_KEY,
                }),
              ]
            : []),
        ],
        spanOutputProcessors: [slackIdentity],
      },
    },
  }),
  logger,
});

await runMigrations();
await mastra.startWorkers();
setMastra(mastra);

orchestrator
  .getChannels()
  ?.initialize(mastra)
  .then(async () => {
    const sdk = orchestrator.getChannels()?.sdk;
    if (!sdk) {
      return;
    }
    setChat(sdk);
    registerEvents();
    await buildAllowlist();
    logger.info('[agent] online');
  })
  .catch((err: unknown) =>
    logger.error('[agent] initialization failed', { err })
  );
