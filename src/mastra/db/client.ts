import { PostgresStore } from '@mastra/pg';
import { Kysely, PostgresDialect } from 'kysely';
import { env } from '@/env';
import type { MCPServersTable } from './schema/mcps';
import type { UserSettingsTable } from './schema/settings';

export const postgresStore = new PostgresStore({
  id: 'main-storage',
  connectionString: env.DATABASE_URL,
});

interface Database {
  mcp_servers: MCPServersTable;
  user_settings: UserSettingsTable;
}

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool: postgresStore.pool }),
});
