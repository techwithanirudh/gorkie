import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { PostgresStore } from '@mastra/pg';
import {
  Observability,
  MastraStorageExporter,
  SensitiveDataFilter,
} from '@mastra/observability';
import { LangfuseExporter } from '@mastra/langfuse';
import { gorkieAgent } from './agents/gorkie';
import { env, langfuseEnabled } from '../env';

const exporters = [
  new MastraStorageExporter(),
  ...(langfuseEnabled
    ? [
        new LangfuseExporter({
          publicKey: env.LANGFUSE_PUBLIC_KEY,
          secretKey: env.LANGFUSE_SECRET_KEY,
          baseUrl: env.LANGFUSE_BASE_URL,
          realtime: env.NODE_ENV === 'development',
        }),
      ]
    : []),
];

export const mastra = new Mastra({
  agents: { gorkieAgent },
  storage: new PostgresStore({
    id: 'gorkie-storage',
    connectionString: env.DATABASE_URL,
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'gorkie',
        exporters,
        // Redact secrets (tokens, keys, passwords) before traces leave the process.
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
  logger: new PinoLogger({
    name: 'gorkie',
    level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  }),
});
