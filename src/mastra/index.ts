import { join } from 'node:path';
import { Mastra } from '@mastra/core/mastra';
import { SpanType } from '@mastra/core/observability';
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

export const mastra = new Mastra({
  agents: { orchestrator, summarizer, research, explore },
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
          new LangfuseFeedbackExporter(),
          new LangfuseExporter({
            baseUrl: env.LANGFUSE_BASE_URL,
            environment: env.NODE_ENV,
            publicKey: env.LANGFUSE_PUBLIC_KEY,
            realtime: !isProduction,
            secretKey: env.LANGFUSE_SECRET_KEY,
          }),
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
