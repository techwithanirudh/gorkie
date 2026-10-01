import type { OAuthStorage } from '@mastra/mcp';
import { and, eq } from 'drizzle-orm';
import { decryptSecret, encryptSecret } from '../../lib/crypto';
import { logger } from '../../lib/logger';
import type { MCPOAuthStatus } from '../../types';
import { db } from '../client';
import { mcpOAuth, mcpServers } from '../schema';

export function mcpOAuthStorage({
  name,
  userId,
}: {
  name: string;
  userId: string;
}): OAuthStorage {
  const where = (key: string) =>
    and(
      eq(mcpOAuth.userId, userId),
      eq(mcpOAuth.serverName, name),
      eq(mcpOAuth.key, key)
    );
  return {
    // A value neither key opens reads as absent, so the SDK falls through
    // to sign-in and the server lands on needs-auth instead of throwing.
    get: async (key) => {
      const [row] = await db.select().from(mcpOAuth).where(where(key));
      if (!row) {
        return;
      }
      try {
        return decryptSecret(row.value);
      } catch (error) {
        logger.warn('[mcp] could not decrypt stored sign-in', {
          error: error instanceof Error ? error.message : 'unknown',
          key,
          name,
          userId,
        });
      }
    },
    set: async (key, value) => {
      const encrypted = encryptSecret(value);
      await db
        .insert(mcpOAuth)
        .values({ key, serverName: name, userId, value: encrypted })
        .onConflictDoUpdate({
          target: [mcpOAuth.userId, mcpOAuth.serverName, mcpOAuth.key],
          set: { value: encrypted },
        });
    },
    delete: async (key) => {
      await db.delete(mcpOAuth).where(where(key));
    },
  };
}

export async function clearMCPOAuth({
  name,
  userId,
}: {
  name: string;
  userId: string;
}): Promise<void> {
  await db
    .delete(mcpOAuth)
    .where(and(eq(mcpOAuth.userId, userId), eq(mcpOAuth.serverName, name)));
}

export async function setMCPOAuthStatus({
  error,
  name,
  status,
  userId,
}: {
  error?: string | null;
  name: string;
  status: MCPOAuthStatus;
  userId: string;
}): Promise<void> {
  await db
    .update(mcpServers)
    .set({
      oauthStatus: status,
      ...(status === 'connected' ? { oauthConnectedAt: new Date() } : {}),
      ...(error === undefined
        ? {}
        : { lastError: error, lastErrorHttpStatus: null }),
    })
    .where(and(eq(mcpServers.userId, userId), eq(mcpServers.name, name)));
}
