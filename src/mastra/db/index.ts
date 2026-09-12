import { join } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { env } from '@/env';
import { db } from './client';

export { db, postgresStore } from './client';

export async function createTables(): Promise<void> {
  // Anchored to the repo root, not cwd. `mastra dev` and `mastra start` run
  // the bundle from `.mastra/output/`, which does not contain `drizzle/`, so a
  // bare relative path fails with "Can't find meta/_journal.json file".
  await migrate(db, {
    migrationsFolder: join(env.PROJECT_ROOT, 'drizzle'),
  });
}
