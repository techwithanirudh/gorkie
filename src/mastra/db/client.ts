import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
import { PostgresStore } from '@mastra/pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '@/env';
import { database as config } from '../config';
import { excludeImageData } from './messages';

// Node gives each resolved address 250 ms before trying the next, and Neon's
// us-east-2 addresses can take over 300 ms to accept from here, so every IPv4
// attempt is cut off and the connection fails with ETIMEDOUT.
setDefaultAutoSelectFamilyAttemptTimeout(config.connectAttemptTimeoutMs);

export const postgresStore = new PostgresStore({
  id: 'main-storage',
  connectionString: env.DATABASE_URL,
});

const { memory } = postgresStore.stores;
if (!memory) {
  throw new Error('Postgres memory storage is required.');
}
const saveMessages = memory.saveMessages.bind(memory);
memory.saveMessages = (args) =>
  saveMessages({ messages: excludeImageData(args) });

// drizzle's `schema` option only feeds the db.query.* relational API, which
// nothing here uses.
export const db = drizzle({ client: postgresStore.pool });
