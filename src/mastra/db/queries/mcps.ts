import { and, asc, eq } from 'drizzle-orm';
import { decryptSecret, encryptSecret } from '../../lib/crypto';
import { logger } from '../../lib/logger';
import {
  type MCPServerConfig,
  mcpOAuthStatusSchema,
  type StoredMCPServer,
  type ToolPermission,
  toolPermissionSchema,
} from '../../types';
import { db, lockUser } from '../client';
import { mcpServers } from '../schema';

function toStoredServer(row: typeof mcpServers.$inferSelect): StoredMCPServer {
  const server = {
    name: row.name,
    permission: toolPermissionSchema.catch('write').parse(row.permission),
    threads: row.threads,
    url: row.url,
    lastError: row.lastError ?? undefined,
    credentialError:
      row.lastErrorHttpStatus === 401
        ? (row.lastError ?? undefined)
        : undefined,
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
      userId: row.userId,
    });
    const unreadable =
      'Gorkie can no longer read the saved token. Remove this server and add it again with its token.';
    return { ...server, credentialError: unreadable, lastError: unreadable };
  }
}

export async function listMCPServers(
  userId: string
): Promise<StoredMCPServer[]> {
  const rows = await db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.userId, userId))
    .orderBy(asc(mcpServers.createdAt));
  return rows.map(toStoredServer);
}

export async function getMCPServer({
  name,
  userId,
}: {
  name: string;
  userId: string;
}): Promise<StoredMCPServer | undefined> {
  const [row] = await db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.userId, userId), eq(mcpServers.name, name)));
  return row ? toStoredServer(row) : undefined;
}

export async function setMCPServerError({
  userId,
  name,
  error,
  httpStatus,
}: {
  userId: string;
  name: string;
  error: string | null;
  httpStatus: number | undefined;
}): Promise<void> {
  await db
    .update(mcpServers)
    .set({ lastError: error, lastErrorHttpStatus: httpStatus ?? null })
    .where(and(eq(mcpServers.userId, userId), eq(mcpServers.name, name)));
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
  return await db.transaction(async (tx) => {
    await lockUser({ scope: 'mcp-servers', tx, userId });
    const existing = await tx
      .select({ name: mcpServers.name })
      .from(mcpServers)
      .where(eq(mcpServers.userId, userId));
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
      threads: server.threads,
      token,
      url: server.url,
      userId,
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
    .where(and(eq(mcpServers.userId, userId), eq(mcpServers.name, name)));
}

export async function setMCPServerAccess({
  name,
  permission,
  threads,
  userId,
}: {
  name: string;
  permission: ToolPermission;
  threads: boolean;
  userId: string;
}): Promise<void> {
  await db
    .update(mcpServers)
    .set({ permission, threads })
    .where(and(eq(mcpServers.userId, userId), eq(mcpServers.name, name)));
}
