import { Mastra } from '@mastra/core/mastra';
import { MastraCompositeStore } from '@mastra/core/storage';
import { PostgresStore } from '@mastra/pg';
import { DuckDBStore } from '@mastra/duckdb';
import {
  Observability,
  MastraStorageExporter,
  SensitiveDataFilter,
} from '@mastra/observability';
import { LangfuseExporter } from '@mastra/langfuse';
import { gorkieAgent } from './agents/gorkie';
import { summarizerAgent } from './agents/summarizer';
import { setChat } from './chat/instance';
import { registerEvents } from './chat/events';
import { logger } from './logger';
import { env } from '../env';

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
        path: './observability.duckdb',
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

void gorkieAgent
  .getChannels()
  ?.initialize(mastra)
  .then(() => {
    const sdk = gorkieAgent.getChannels()?.sdk;
    if (!sdk) return;
    setChat(sdk);
    registerEvents();
    console.log('[gorkie] online');
  })
  .catch((err: unknown) => console.error('[gorkie] channels init failed', err));
