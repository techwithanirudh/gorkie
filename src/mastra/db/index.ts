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

// Legacy rows hold the secret in plaintext and are sealed as they are. A
// sealed row neither the current nor the previous key opens stays unreadable.
function resealUnderCurrentKey(
  stored: string
): { sealed: string } | { unreadable: true } {
  const legacyPlaintext = !isEncryptedSecret(stored);
  try {
    return {
      sealed: encryptSecret(legacyPlaintext ? stored : decryptSecret(stored)),
    };
  } catch {
    return { unreadable: true };
  }
}

async function resealSecrets(): Promise<void> {
  // The prefix carries the key id, so a row sealed under an older key or not
  // sealed at all fails this pattern.
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
      const token = resealUnderCurrentKey(row.token);
      const refreshToken = row.refreshToken
        ? resealUnderCurrentKey(row.refreshToken)
        : { sealed: null };
      if ('unreadable' in token || 'unreadable' in refreshToken) {
        unreadable.push(`github_credentials:${row.userId}`);
        return;
      }
      await db
        .update(githubCredentials)
        .set({
          refreshToken: refreshToken.sealed,
          token: token.sealed,
        })
        .where(
          and(
            eq(githubCredentials.userId, row.userId),
            eq(githubCredentials.token, row.token)
          )
        );
    }),
    ...servers.map(async (row) => {
      const token = row.token ? resealUnderCurrentKey(row.token) : undefined;
      if (!(row.token && token) || 'unreadable' in token) {
        unreadable.push(`mcp_servers:${row.userId}:${row.name}`);
        return;
      }
      await db
        .update(mcpServers)
        .set({ token: token.sealed })
        .where(
          and(
            eq(mcpServers.userId, row.userId),
            eq(mcpServers.name, row.name),
            eq(mcpServers.token, row.token)
          )
        );
    }),
    ...oauth.map(async (row) => {
      const value = resealUnderCurrentKey(row.value);
      if ('unreadable' in value) {
        unreadable.push(`mcp_oauth:${row.userId}:${row.serverName}`);
        signedOut.set(`${row.userId}\n${row.serverName}`, {
          name: row.serverName,
          userId: row.userId,
        });
        return;
      }
      await db
        .update(mcpOAuth)
        .set({ value: value.sealed })
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
