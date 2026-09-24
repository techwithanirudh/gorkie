import type { OAuthStorage } from '@mastra/mcp';
import { and, eq } from 'drizzle-orm';
import { decryptSecret, encryptSecret } from '../../lib/crypto';
import { rawId } from '../../lib/ids';
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
  const id = rawId(userId);
  const where = (key: string) =>
    and(
      eq(mcpOAuth.userId, id),
      eq(mcpOAuth.serverName, name),
      eq(mcpOAuth.key, key)
    );
  return {
    get: async (key) => {
      const [row] = await db.select().from(mcpOAuth).where(where(key));
      return row ? decryptSecret(row.value) : undefined;
    },
    set: async (key, value) => {
      const encrypted = encryptSecret(value);
      await db
        .insert(mcpOAuth)
        .values({ key, serverName: name, userId: id, value: encrypted })
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
    .where(
      and(eq(mcpOAuth.userId, rawId(userId)), eq(mcpOAuth.serverName, name))
    );
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
      ...(error === undefined ? {} : { lastError: error }),
    })
    .where(
      and(eq(mcpServers.userId, rawId(userId)), eq(mcpServers.name, name))
    );
}
