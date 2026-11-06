import { and, eq, isNotNull, notLike, or } from 'drizzle-orm';
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  sealedUnderCurrentKeyPattern,
} from '../lib/crypto';
import { logger } from '../lib/logger';
import { db } from './client';
import { setMCPOAuthStatus } from './queries/mcp-oauth';
import { githubCredentials, mcpOAuth, mcpServers } from './schema';

function resealUnderCurrentKey({
  acceptsMainPlaintext = false,
  stored,
}: {
  acceptsMainPlaintext?: boolean;
  stored: string;
}): { sealed: string } | { unreadable: true } {
  const plaintext = acceptsMainPlaintext && !isEncryptedSecret(stored);
  try {
    return {
      sealed: encryptSecret(plaintext ? stored : decryptSecret(stored)),
    };
  } catch {
    return { unreadable: true };
  }
}

async function resealGitHubCredentials(): Promise<string[]> {
  const rows = await db
    .select()
    .from(githubCredentials)
    .where(
      or(
        notLike(githubCredentials.token, sealedUnderCurrentKeyPattern),
        notLike(githubCredentials.refreshToken, sealedUnderCurrentKeyPattern)
      )
    );
  const unreadable = await Promise.all(
    rows.map(async (row) => {
      const token = resealUnderCurrentKey({ stored: row.token });
      const refreshToken = row.refreshToken
        ? resealUnderCurrentKey({ stored: row.refreshToken })
        : { sealed: null };
      if ('unreadable' in token || 'unreadable' in refreshToken) {
        return `github_credentials:${row.userId}`;
      }
      await db
        .update(githubCredentials)
        .set({ refreshToken: refreshToken.sealed, token: token.sealed })
        .where(
          and(
            eq(githubCredentials.userId, row.userId),
            eq(githubCredentials.token, row.token)
          )
        );
    })
  );
  return unreadable.filter((label) => label !== undefined);
}

async function resealMCPServerTokens(): Promise<string[]> {
  const rows = await db
    .select({
      name: mcpServers.name,
      token: mcpServers.token,
      userId: mcpServers.userId,
    })
    .from(mcpServers)
    .where(
      and(
        isNotNull(mcpServers.token),
        notLike(mcpServers.token, sealedUnderCurrentKeyPattern)
      )
    );
  const unreadable = await Promise.all(
    rows.map(async (row) => {
      const token = row.token
        ? resealUnderCurrentKey({
            acceptsMainPlaintext: true,
            stored: row.token,
          })
        : undefined;
      if (!(row.token && token) || 'unreadable' in token) {
        return `mcp_servers:${row.userId}:${row.name}`;
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
    })
  );
  return unreadable.filter((label) => label !== undefined);
}

async function resealMCPOAuth(): Promise<string[]> {
  const rows = await db
    .select()
    .from(mcpOAuth)
    .where(notLike(mcpOAuth.value, sealedUnderCurrentKeyPattern));
  const signedOut = new Map<string, { name: string; userId: string }>();
  const unreadable = await Promise.all(
    rows.map(async (row) => {
      const value = resealUnderCurrentKey({ stored: row.value });
      if ('unreadable' in value) {
        signedOut.set(`${row.userId}\n${row.serverName}`, {
          name: row.serverName,
          userId: row.userId,
        });
        return `mcp_oauth:${row.userId}:${row.serverName}`;
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
    })
  );
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
  return unreadable.filter((label) => label !== undefined);
}

export async function resealSecrets(): Promise<void> {
  const unreadable = (
    await Promise.all([
      resealGitHubCredentials(),
      resealMCPServerTokens(),
      resealMCPOAuth(),
    ])
  ).flat();
  if (unreadable.length > 0) {
    logger.warn(
      '[crypto] secrets neither CREDENTIALS_KEY nor CREDENTIALS_KEY_PREVIOUS can open',
      { rows: unreadable }
    );
  }
}
