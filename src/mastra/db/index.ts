import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from './client';

export { db, postgresStore } from './client';

export async function createTables(): Promise<void> {
  await migrate(db, { migrationsFolder: 'drizzle' });
}
