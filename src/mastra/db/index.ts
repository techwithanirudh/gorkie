import { join } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { env } from '@/env';
import { db, postgresStore } from './client';
import { resealSecrets } from './reseal';

export async function runMigrations(): Promise<void> {
  // Mastra creates and upgrades its own tables lazily, on the first storage
  // call. Some migrations rewrite Mastra tables and name their current
  // columns, so bring them to this version's shape first.
  await postgresStore.init();
  await migrate(db, {
    migrationsFolder: join(env.PROJECT_ROOT, 'drizzle'),
  });
  await resealSecrets();
}
