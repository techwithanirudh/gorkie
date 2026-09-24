import { and, asc, eq, sql } from 'drizzle-orm';
import { decryptSecret, encryptSecret } from '../../lib/crypto';
import { rawId } from '../../lib/ids';
import { logger } from '../../lib/logger';
import {
  type MCPServerConfig,
  mcpOAuthStatusSchema,
  type StoredMCPServer,
  type ToolPermission,
  toolPermissionSchema,
} from '../../types';
import { db } from '../client';
import { mcpServers } from '../schema';

export async function listMCPServers(
  userId: string
): Promise<StoredMCPServer[]> {
  const rows = await db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.userId, rawId(userId)))
    .orderBy(asc(mcpServers.createdAt));
  return rows.map((row) => {
    const server = {
      name: row.name,
      permission: toolPermissionSchema.parse(row.permission),
      url: row.url,
      lastError: row.lastError ?? undefined,
      ...(row.oauthStatus
        ? {
            oauth: {
              status: mcpOAuthStatusSchema
                .catch('needs-auth')
                .parse(row.oauthStatus),
              connectedAt: row.oauthConnectedAt ?? undefined,
            },
          }
        : {}),
    };
    if (!row.token) {
      return server;
    }
    try {
      return { ...server, token: decryptSecret(row.token) };
    } catch (error) {
      logger.warn('[mcp] could not decrypt stored server token', {
        error,
        name: row.name,
        userId,
      });
      return {
        ...server,
        lastError:
          'The saved token can no longer be decrypted. Reconnect this server with its token.',
      };
    }
  });
}

export async function setMCPServerError({
  userId,
  name,
  error,
}: {
  userId: string;
  name: string;
  error: string | null;
}): Promise<void> {
  await db
    .update(mcpServers)
    .set({ lastError: error })
    .where(
      and(eq(mcpServers.userId, rawId(userId)), eq(mcpServers.name, name))
    );
}

export async function insertMCPServer({
  userId,
  server,
  maxServers,
}: {
  userId: string;
  server: MCPServerConfig;
  maxServers: number;
}): Promise<'ok' | 'limit-reached' | 'name-taken'> {
  const id = rawId(userId);
  return await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${id}))`);
    const existing = await tx
      .select({ name: mcpServers.name })
      .from(mcpServers)
      .where(eq(mcpServers.userId, id));
    if (existing.some((row) => row.name === server.name)) {
      return 'name-taken';
    }
    if (existing.length >= maxServers) {
      return 'limit-reached';
    }
    const token = server.token ? encryptSecret(server.token) : null;
    await tx.insert(mcpServers).values({
      name: server.name,
      permission: server.permission,
      token,
      url: server.url,
      userId: id,
    });
    return 'ok';
  });
}

export async function removeMCPServer({
  userId,
  name,
}: {
  userId: string;
  name: string;
}): Promise<void> {
  await db
    .delete(mcpServers)
    .where(
      and(eq(mcpServers.userId, rawId(userId)), eq(mcpServers.name, name))
    );
}

export async function setMCPServerPermission({
  name,
  permission,
  userId,
}: {
  name: string;
  permission: ToolPermission;
  userId: string;
}): Promise<void> {
  await db
    .update(mcpServers)
    .set({ permission })
    .where(
      and(eq(mcpServers.userId, rawId(userId)), eq(mcpServers.name, name))
    );
}
