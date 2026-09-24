import { join } from 'node:path';
import { Mastra } from '@mastra/core/mastra';
import { SpanType } from '@mastra/core/observability';
import { SimpleAuth } from '@mastra/core/server';
import { MastraCompositeStore } from '@mastra/core/storage';
import { DuckDBStore } from '@mastra/duckdb';
import { LangfuseExporter } from '@mastra/langfuse';
import { MastraStorageExporter, Observability } from '@mastra/observability';
import { z } from 'zod';
import { env } from '@/env';
import { explore } from './agents/explore';
import { orchestrator } from './agents/orchestrator';
import { research } from './agents/research';
import { summarizer } from './agents/summarizer';
import { registerEvents } from './chat/events';
import { setMastra } from './chat/mastra-instance';
import { isBanned } from './chat/moderation';
import { TurnDrainWorker } from './chat/turn-drain';
import { postgresStore, runMigrations } from './db';
import { buildAllowlist } from './lib/allowed-users';
import { channelSchema } from './lib/context';
import { verifyLiveViewTicket } from './lib/crypto';
import { logger } from './lib/logger';
import { LangfuseFeedbackExporter } from './observability/langfuse-feedback';
import { slackIdentity } from './observability/slack-identity';
import { trimPayloads } from './observability/trim-payloads';
import { liveViewRoutes } from './server/live-view';
import { oauthRoutes } from './server/oauth';
import { isWaitSchedule } from './tools/scheduled-tasks/queries';

process.on('unhandledRejection', (err: unknown) => {
  logger.error('[process] unhandled rejection', { err });
});
process.on('uncaughtException', (err: Error) => {
  logger.error('[process] uncaught exception', { err });
});

const isProduction = env.NODE_ENV === 'production';

// DuckDB is single-writer: a second process holding the file lock must not
// take the bot down with it, it just runs without local traces.
const traceStore = isProduction
  ? undefined
  : await new DuckDBStore({
      path: join(env.PROJECT_ROOT, 'observability.duckdb'),
    })
      .getStore('observability')
      .then(async (store) => {
        await store?.init();
        return store;
      })
      .catch((error: unknown) => {
        logger.error('[observability] local trace store failed to open', {
          error,
        });
      });
if (traceStore) {
  const prune = () =>
    traceStore
      .prune({
        logs: { maxAge: '7d' },
        metrics: { maxAge: '7d' },
        scores: { maxAge: '7d' },
        spans: { maxAge: '7d' },
      })
      .catch((error: unknown) => {
        logger.warn('[observability] pruning old traces failed', { error });
      });
  // Fired and forgotten: pruning must not hold boot, and a failure only leaves
  // old traces behind. unref() keeps the timer from holding the process open.
  prune();
  setInterval(prune, 24 * 60 * 60 * 1000).unref();
}

// Before the Mastra constructor, which starts channels without awaiting them:
// a Slack message handled mid-migration would read and write threads the
// migration is renaming.
await runMigrations();

// A wait's cron recurs yearly, so the row goes once it has fired however the
// run ended. `onFinish` alone misses runs that errored or were aborted.
async function deleteFiredWait({
  mastra: runtime,
  schedule,
}: {
  mastra: Mastra;
  schedule: { id: string; metadata?: unknown };
}): Promise<void> {
  if (isWaitSchedule(schedule)) {
    await runtime.schedules.delete(schedule.id);
  }
}

export const mastra = new Mastra({
  agents: { orchestrator, summarizer, research, explore },
  server: {
    host: env.HOST,
    port: env.PORT,
    cors: false,
    // How long SIGTERM waits for Slack turns to finish (TurnDrainWorker) before
    // aborting them. systemd's TimeoutStopSec must exceed twice this plus 5s:
    // Mastra spends up to one window on HTTP, then another on its own shutdown.
    drainTimeout: isProduction ? 120_000 : 10_000,
    build: { openAPIDocs: false, swaggerUI: false },
    apiRoutes: [...oauthRoutes, ...liveViewRoutes],
    ...(env.GORKIE_API_TOKEN
      ? {
          auth: new SimpleAuth({
            tokens: {
              [env.GORKIE_API_TOKEN]: { id: 'operator', name: 'operator' },
            },
          }),
        }
      : {}),
  },
  schedules: {
    prepare: async ({ mastra: runtime, schedule }) => {
      const current = await runtime.schedules.get(schedule.id);
      if (!current) {
        return;
      }
      // Skip rather than delete, so lifting the ban resumes the person's tasks.
      const creator =
        z
          .object({ channel: channelSchema })
          .safeParse(
            'ifIdle' in current
              ? current.ifIdle?.streamOptions?.requestContext
              : undefined
          ).data?.channel.userId ?? current.resourceId;
      if (creator && (await isBanned(creator))) {
        logger.info("[schedules] skipped a banned user's fire", {
          scheduleId: schedule.id,
        });
        return null;
      }
    },
    onFinish: deleteFiredWait,
    onError: deleteFiredWait,
    onAbort: deleteFiredWait,
  },
  // Creates `mastra_background_tasks`. Only run_background opts in; its own
  // completion hook wakes the thread.
  backgroundTasks: {
    enabled: true,
    cleanup: { cleanupIntervalMs: 60 * 60 * 1000 },
  },
  workers: [new TurnDrainWorker()],
  storage: traceStore
    ? new MastraCompositeStore({
        id: 'composite-storage',
        default: postgresStore,
        domains: { observability: traceStore },
      })
    : postgresStore,
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
          ...(traceStore ? [new MastraStorageExporter()] : []),
          new LangfuseFeedbackExporter(),
          new LangfuseExporter({
            baseUrl: env.LANGFUSE_BASE_URL,
            environment: env.NODE_ENV,
            publicKey: env.LANGFUSE_PUBLIC_KEY,
            realtime: !isProduction,
            secretKey: env.LANGFUSE_SECRET_KEY,
          }),
        ],
        spanOutputProcessors: [slackIdentity, trimPayloads],
      },
    },
  }),
  logger,
});

// Operator routes are for the host, never for anything that arrived through the
// tunnel or a proxy. Set here rather than as `server.middleware`: that runs
// after Mastra registers the screencast WebSocket and its browser session and
// close routes, which then answer before the guard sees them. Mastra skips this
// for public routes (the Slack webhook, OAuth and live view pages).
mastra.setServerMiddleware([
  {
    path: '*',
    handler: async (c, next) => {
      const proxied =
        c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for');
      // Mastra registers the screencast WebSocket with no auth of its own,
      // so a proxied viewer needs a live-view ticket for that exact thread.
      const ticket = verifyLiveViewTicket(c.req.query('t'));
      const liveViewer =
        c.req.path === `/browser/${orchestrator.id}/stream` &&
        ticket !== undefined &&
        ticket.threadId === c.req.query('threadId');
      if (proxied && c.req.path !== '/health' && !liveViewer) {
        return c.text('Not found', 404);
      }
      await next();
    },
  },
]);

// Before anything awaits: channels may already be handing Slack messages to
// handlers that call getMastra().
setMastra(mastra);
await mastra.startWorkers();

// Mastra starts channels itself without awaiting them. initialize() is
// idempotent and returns that same promise, so this hooks the post-init wiring
// onto it without holding module load.
const channels = orchestrator.getChannels();
channels
  ?.initialize(mastra)
  .then(async () => {
    if (!channels.sdk) {
      return;
    }
    channels.sdk.registerSingleton();
    registerEvents();
    await buildAllowlist();
    logger.info('[agent] online');
  })
  .catch((err: unknown) =>
    logger.error('[agent] initialization failed', { err })
  );
