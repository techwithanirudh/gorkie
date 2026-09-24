import { join } from 'node:path';
import { and, eq, isNotNull, notLike, or } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { env } from '@/env';
import {
  currentSecretPrefix,
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
} from '../lib/crypto';
import { logger } from '../lib/logger';
import { db, postgresStore } from './client';
import { setMCPOAuthStatus } from './queries/mcp-oauth';
import { githubCredentials, mcpOAuth, mcpServers } from './schema';

export { postgresStore } from './client';

// Plaintext rows predate encryption at rest (MCP tokens only). A row neither
// key opens stays untouched, so restarting with the right
// CREDENTIALS_KEY_PREVIOUS still recovers it.
function reseal(stored: string): string | null {
  try {
    return encryptSecret(
      isEncryptedSecret(stored) ? decryptSecret(stored) : stored
    );
  } catch {
    return null;
  }
}

// Moves every secret onto the current CREDENTIALS_KEY, so the previous key
// can be dropped after one clean boot.
async function resealSecrets(): Promise<void> {
  const resealed = `${currentSecretPrefix}%`;

  const github = await db
    .select()
    .from(githubCredentials)
    .where(
      or(
        notLike(githubCredentials.token, resealed),
        notLike(githubCredentials.refreshToken, resealed)
      )
    );
  const servers = await db
    .select({
      name: mcpServers.name,
      token: mcpServers.token,
      userId: mcpServers.userId,
    })
    .from(mcpServers)
    .where(
      and(isNotNull(mcpServers.token), notLike(mcpServers.token, resealed))
    );
  const oauth = await db
    .select()
    .from(mcpOAuth)
    .where(notLike(mcpOAuth.value, resealed));

  const unreadable: string[] = [];
  const signedOut = new Map<string, { name: string; userId: string }>();

  await Promise.all([
    ...github.map(async (row) => {
      const token = reseal(row.token);
      const refreshToken = row.refreshToken ? reseal(row.refreshToken) : null;
      if (!token || (row.refreshToken && !refreshToken)) {
        unreadable.push(`github_credentials:${row.userId}`);
        return;
      }
      // Guarded on the old value, so a refresh that lands meanwhile wins.
      await db
        .update(githubCredentials)
        .set({ refreshToken, token })
        .where(
          and(
            eq(githubCredentials.userId, row.userId),
            eq(githubCredentials.token, row.token)
          )
        );
    }),
    ...servers.map(async (row) => {
      const token = row.token ? reseal(row.token) : null;
      if (!(row.token && token)) {
        unreadable.push(`mcp_servers:${row.userId}:${row.name}`);
        return;
      }
      await db
        .update(mcpServers)
        .set({ token })
        .where(
          and(
            eq(mcpServers.userId, row.userId),
            eq(mcpServers.name, row.name),
            eq(mcpServers.token, row.token)
          )
        );
    }),
    ...oauth.map(async (row) => {
      const value = reseal(row.value);
      if (!value) {
        unreadable.push(`mcp_oauth:${row.userId}:${row.serverName}`);
        signedOut.set(`${row.userId}\n${row.serverName}`, {
          name: row.serverName,
          userId: row.userId,
        });
        return;
      }
      await db
        .update(mcpOAuth)
        .set({ value })
        .where(
          and(
            eq(mcpOAuth.userId, row.userId),
            eq(mcpOAuth.serverName, row.serverName),
            eq(mcpOAuth.key, row.key),
            eq(mcpOAuth.value, row.value)
          )
        );
    }),
  ]);

  // A sign-in that cannot be read is a sign-in to redo, not a turn-time throw.
  await Promise.all(
    [...signedOut.values()].map(({ name, userId }) =>
      setMCPOAuthStatus({
        error:
          'Gorkie can no longer read this sign-in. Press Reconnect on this server in the Home tab.',
        name,
        status: 'needs-auth',
        userId,
      })
    )
  );
  if (unreadable.length > 0) {
    logger.warn(
      '[crypto] secrets neither CREDENTIALS_KEY nor CREDENTIALS_KEY_PREVIOUS can open',
      { rows: unreadable }
    );
  }
}

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
