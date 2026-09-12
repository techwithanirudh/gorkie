import { join } from 'node:path';
import { Mastra } from '@mastra/core/mastra';
import { SpanType } from '@mastra/core/observability';
import { MastraCompositeStore } from '@mastra/core/storage';
import { DuckDBStore } from '@mastra/duckdb';
import {
  MastraPlatformExporter,
  MastraStorageExporter,
  Observability,
} from '@mastra/observability';
import { env } from '@/env';
import { exploreAgent as explore } from './agents/explore';
import orchestrator from './agents/orchestrator';
import { researchAgent as research } from './agents/research';
import { summarizer } from './agents/summarizer';
import { registerEvents } from './chat/events';
import { setChat } from './chat/instance';
import { setMastra } from './chat/mastra-instance';
import { createTables, postgresStore } from './db';
import { buildAllowlist } from './lib/allowed-users';
import { logger } from './lib/logger';

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
          // Anchored to the repo root, not cwd: a bare relative path lands
          // under `src/mastra/public/`, which `mastra build` copies as a
          // static asset, and the file reaches gigabytes.
          observability: await new DuckDBStore({
            path: join(env.MASTRA_PROJECT_ROOT, 'observability.duckdb'),
          }).getStore('observability'),
        },
      }),
  observability: new Observability({
    configs: {
      default: {
        // Dropped in the span constructor, before `deepClean` copies the
        // payload and before the span holds a reference to it for the rest of
        // the trace. `customSpanFormatter` cannot substitute: it runs at
        // export, long after the allocation it would need to prevent.
        //
        // A run is readable from `agent_run`, `model_inference` and
        // `tool_call` alone. `processor_run` is two thirds of all spans and
        // each one re-records the entire message array, so keeping them costs
        // a copy of the conversation per processor per step, on a 2GB host
        // that OOM-killed itself on 2026-09-12. `model_generation` and
        // `model_step` are brackets around `model_inference` and carry no
        // content of their own, and `mapping` is step-to-step plumbing.
        // Together the four are 80% of spans. What this gives up is
        // per-processor latency and the retry-processor spans that explained
        // the largest traces.
        excludeSpanTypes: [
          SpanType.MAPPING,
          SpanType.MODEL_GENERATION,
          SpanType.MODEL_STEP,
          SpanType.PROCESSOR_RUN,
        ],
        serviceName: 'orchestrator',
        exporters: [
          ...(isProduction ? [] : [new MastraStorageExporter()]),
          new MastraPlatformExporter({
            accessToken: env.MASTRA_PLATFORM_ACCESS_TOKEN,
            projectId: env.MASTRA_PROJECT_ID,
          }),
        ],
      },
    },
  }),
  logger,
});

await createTables();
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
