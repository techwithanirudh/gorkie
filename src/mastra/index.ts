import { Mastra } from '@mastra/core/mastra';
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
          observability: await new DuckDBStore({
            path: './observability.duckdb',
          }).getStore('observability'),
        },
      }),
  observability: new Observability({
    configs: {
      default: {
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
