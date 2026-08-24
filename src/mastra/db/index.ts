import { createUserBansTable } from './schema/bans';
import { createMCPServersTable } from './schema/mcps';
import { createUserSettingsTable } from './schema/settings';

export { db, postgresStore } from './client';

export async function createTables(): Promise<void> {
  await Promise.all([
    createUserBansTable(),
    createMCPServersTable(),
    createUserSettingsTable(),
  ]);
}
