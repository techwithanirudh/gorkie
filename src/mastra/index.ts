import { join } from 'node:path';
import { Mastra } from '@mastra/core/mastra';
import { MastraCompositeStore } from '@mastra/core/storage';
import { DuckDBStore } from '@mastra/duckdb';
import { LangfuseExporter } from '@mastra/langfuse';
import {
  MastraStorageExporter,
  Observability,
  SensitiveDataFilter,
} from '@mastra/observability';
import { PostgresStore } from '@mastra/pg';
import { env } from '../env';
import { gorkieAgent } from './agents/gorkie';
import { summarizerAgent } from './agents/summarizer';
import { registerEvents } from './chat/events';
import { setChat } from './chat/instance';
import { buildAllowlist } from './lib/allowed-users';
import { logger } from './lib/logger';

/**
 * `mastra dev`'s actual server process runs with cwd set to its own dev
 * public dir, and `mastra start` runs with cwd set to `.mastra/output` —
 * neither is the repo root. A bare relative DuckDB path silently resolves
 * to a different file per mode. Both CLI paths inject MASTRA_PROJECT_ROOT
 * (the real repo root) as an env var specifically for this, so anchor to
 * that instead of relying on cwd.
 */
const projectRoot = process.env.MASTRA_PROJECT_ROOT ?? process.cwd();

process.on('unhandledRejection', (error: unknown) => {
  logger.error('[process] unhandled rejection', { error });
});
process.on('uncaughtException', (error: Error) => {
  logger.error('[process] uncaught exception', { error });
});

export const mastra = new Mastra({
  agents: { gorkieAgent, summarizerAgent },
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new PostgresStore({
      id: 'gorkie-storage',
      connectionString: env.DATABASE_URL,
    }),
    domains: {
      observability: await new DuckDBStore({
        path: join(projectRoot, 'observability.duckdb'),
      }).getStore('observability'),
    },
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'gorkie',
        exporters: [
          new MastraStorageExporter(),
          new LangfuseExporter({
            publicKey: env.LANGFUSE_PUBLIC_KEY,
            secretKey: env.LANGFUSE_SECRET_KEY,
            baseUrl: env.LANGFUSE_BASEURL,
            realtime: env.NODE_ENV === 'development',
          }),
        ],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
  logger,
});

await mastra.startWorkers();

gorkieAgent
  .getChannels()
  ?.initialize(mastra)
  .then(async () => {
    const sdk = gorkieAgent.getChannels()?.sdk;
    if (!sdk) {
      return;
    }
    setChat(sdk);
    registerEvents();
    await buildAllowlist();
    logger.info('[gorkie] online');
  })
  .catch((error: unknown) =>
    logger.error('[gorkie] initialization failed', { error })
  );
