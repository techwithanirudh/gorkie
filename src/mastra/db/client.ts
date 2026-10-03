import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
import { PostgresStore } from '@mastra/pg';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '@/env';
import { database as config } from '../config';

// Node gives each resolved address 250 ms before trying the next, and Neon's
// us-east-2 addresses can take over 300 ms to accept from here, so every IPv4
// attempt is cut off and the connection fails with ETIMEDOUT.
setDefaultAutoSelectFamilyAttemptTimeout(config.connectAttemptTimeoutMs);

export const postgresStore = new PostgresStore({
  id: 'main-storage',
  connectionString: env.DATABASE_URL,
});

export const db = drizzle({ client: postgresStore.pool });

export async function lockUser({
  scope,
  tx,
  userId,
}: {
  scope: 'mcp-servers' | 'usage';
  tx: Pick<typeof db, 'execute'>;
  userId: string;
}): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${scope}), hashtext(${userId}))`
  );
}
