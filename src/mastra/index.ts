import { Mastra } from '@mastra/core/mastra';
import { SpanType } from '@mastra/core/observability';
import { SimpleAuth } from '@mastra/core/server';
import { MastraCompositeStore } from '@mastra/core/storage';
import { LangfuseExporter } from '@mastra/langfuse';
import { MastraStorageExporter, Observability } from '@mastra/observability';
import { env } from '@/env';
import { explore } from './agents/explore';
import { orchestrator } from './agents/orchestrator';
import { research } from './agents/research';
import { summarizer } from './agents/summarizer';
import { buildAllowlist } from './chat/allowed-users';
import { registerEvents } from './chat/events';
import { setMastra } from './chat/mastra-instance';
import { TurnDrainWorker } from './chat/turn-drain';
import { backgroundTasks, shutdown } from './config';
import { runMigrations } from './db';
import { postgresStore } from './db/client';
import { logger } from './lib/logger';
import { LangfuseFeedbackExporter } from './observability/langfuse-feedback';
import { slackIdentity } from './observability/slack-identity';
import { trimPayloads } from './observability/trim-payloads';
import { deleteFiredWait, gateScheduledFire } from './schedule-hooks';
import { oauthRoutes } from './server/oauth';
import { traceStore } from './trace-store';

process.on('unhandledRejection', (err: unknown) => {
  logger.error('[process] unhandled rejection', { err });
});
// Before the Mastra constructor, which starts channels without awaiting them:
// a Slack message handled mid-migration would read and write threads the
// migration is renaming.
await runMigrations();

const langfuse = new LangfuseExporter({
  baseUrl: env.LANGFUSE_BASE_URL,
  environment: env.NODE_ENV,
  publicKey: env.LANGFUSE_PUBLIC_KEY,
  realtime: env.NODE_ENV !== 'production',
  secretKey: env.LANGFUSE_SECRET_KEY,
});

export const mastra = new Mastra({
  agents: { orchestrator, summarizer, research, explore },
  server: {
    host: env.HOST,
    port: env.PORT,
    cors: false,
    drainTimeout: shutdown.drainTimeoutMs,
    build: { openAPIDocs: false, swaggerUI: false },
    apiRoutes: oauthRoutes,
    auth: new SimpleAuth({
      tokens: {
        [env.GORKIE_API_TOKEN]: { id: 'operator', name: 'operator' },
      },
    }),
  },
  schedules: {
    prepare: gateScheduledFire,
    onFinish: deleteFiredWait,
    onError: deleteFiredWait,
    onAbort: deleteFiredWait,
  },
  backgroundTasks: {
    enabled: true,
    cleanup: { cleanupIntervalMs: backgroundTasks.cleanupIntervalMs },
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
          new LangfuseFeedbackExporter(langfuse.client),
          langfuse,
        ],
        spanOutputProcessors: [slackIdentity, trimPayloads],
      },
    },
  }),
  logger,
});

// Registered once `mastra` exists: a failure during migrations above is a
// top-level rejection and already exits. Node does not support resuming after
// an uncaught exception, so drain the turns in flight, then exit non-zero so
// systemd restarts the process.
process.once('uncaughtException', (err: Error) => {
  logger.error('[process] uncaught exception, shutting down', { err });
  mastra
    .shutdown({ drainTimeout: shutdown.drainTimeoutMs })
    .catch((error: unknown) => {
      logger.error('[process] shutdown after an uncaught exception failed', {
        error,
      });
    })
    .finally(() => process.exit(1));
});

// Operator routes are for the host, never for anything that arrived through the
// tunnel or a proxy. Mastra skips this for public routes (the Slack webhook and
// OAuth pages).
mastra.setServerMiddleware([
  {
    path: '*',
    handler: async (c, next) => {
      const proxied =
        c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for');
      if (proxied && c.req.path !== '/health') {
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
