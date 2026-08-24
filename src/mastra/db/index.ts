import { createMCPServersTable } from './schema/mcps';
import { createUserSettingsTable } from './schema/settings';

export { db, postgresStore } from './client';

export async function createTables(): Promise<void> {
  await Promise.all([createMCPServersTable(), createUserSettingsTable()]);
}
