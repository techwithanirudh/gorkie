import { Mastra } from '@mastra/core/mastra';
import {
  MastraPlatformExporter,
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

process.on('unhandledRejection', (error: unknown) => {
  logger.error('[process] unhandled rejection', { error });
});
process.on('uncaughtException', (error: Error) => {
  logger.error('[process] uncaught exception', { error });
});

export const mastra = new Mastra({
  agents: { gorkieAgent, summarizerAgent },
  storage: new PostgresStore({
    id: 'gorkie-storage',
    connectionString: env.DATABASE_URL,
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'gorkie',
        exporters: [
          new MastraPlatformExporter({
            accessToken: env.MASTRA_PLATFORM_ACCESS_TOKEN,
            projectId: env.MASTRA_PROJECT_ID,
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
