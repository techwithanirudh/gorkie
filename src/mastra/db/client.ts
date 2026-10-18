import { PostgresStore } from '@mastra/pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '@/env';

export const postgresStore = new PostgresStore({
  id: 'main-storage',
  connectionString: env.DATABASE_URL,
});

// drizzle v1 takes the driver via `{ client }`; `schema` is only for the
// db.query.* relational API, which gorkie does not use (tables are imported
// directly and used with the core query builder).
export const db = drizzle({ client: postgresStore.pool });
