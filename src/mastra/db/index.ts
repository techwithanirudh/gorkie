import { join } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { env } from '@/env';
import { db } from './client';

export { db, postgresStore } from './client';

// Applies the checked-in drizzle migrations for gorkie's own tables
// (github_credentials, mcp_servers, user_settings). Mastra's PostgresStore
// creates its own tables (memory, channel state, schedules, background tasks)
// on init, so those are not covered here.
export async function runMigrations(): Promise<void> {
  await migrate(db, {
    migrationsFolder: join(env.PROJECT_ROOT, 'drizzle'),
  });
}
