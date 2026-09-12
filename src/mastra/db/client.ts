import { PostgresStore } from '@mastra/pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '@/env';
import * as schema from './schema';

export const postgresStore = new PostgresStore({
  id: 'main-storage',
  connectionString: env.DATABASE_URL,
});

export const db = drizzle(postgresStore.pool, { schema });
