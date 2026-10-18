import { join } from 'node:path';
import { and, eq, isNotNull, notLike } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { env } from '@/env';
import { encryptSecret } from '../lib/crypto';
import { db } from './client';
import { mcpServers } from './schema';

export { db, postgresStore } from './client';

// Applies the checked-in drizzle migrations for gorkie's own tables. Mastra's
// PostgresStore creates its own tables on init, so those are not covered here.
export async function runMigrations(): Promise<void> {
  await migrate(db, {
    migrationsFolder: join(env.PROJECT_ROOT, 'drizzle'),
  });

  // MCP tokens saved before encryption at rest are still plaintext. SQL cannot
  // encrypt them because the key lives only in the host env, so do it here.
  const plaintext = await db
    .select({
      name: mcpServers.name,
      token: mcpServers.token,
      userId: mcpServers.userId,
    })
    .from(mcpServers)
    .where(and(isNotNull(mcpServers.token), notLike(mcpServers.token, 'v1.%')));
  await Promise.all(
    plaintext.map(({ name, token, userId }) =>
      token
        ? db
            .update(mcpServers)
            .set({ token: encryptSecret(token) })
            .where(
              and(eq(mcpServers.userId, userId), eq(mcpServers.name, name))
            )
        : undefined
    )
  );
}
