import { and, asc, eq, sql } from 'drizzle-orm';
import { decryptSecret, encryptSecret } from '../../lib/crypto';
import { rawId } from '../../lib/ids';
import {
  type MCPServerConfig,
  type ToolPermission,
  toolPermissionSchema,
} from '../../types';
import { db } from '../client';
import { mcpServers } from '../schema';

export async function listMCPServers(
  userId: string
): Promise<(MCPServerConfig & { lastError?: string })[]> {
  const rows = await db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.userId, rawId(userId)))
    .orderBy(asc(mcpServers.createdAt));
  return rows.map((row) => ({
    name: row.name,
    permission: toolPermissionSchema.parse(row.permission),
    token: row.token ? decryptSecret(row.token) : undefined,
    url: row.url,
    lastError: row.lastError ?? undefined,
  }));
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

export async function upsertMCPServer({
  userId,
  server,
  maxServers,
}: {
  userId: string;
  server: MCPServerConfig;
  maxServers: number;
}): Promise<'ok' | 'limit-reached'> {
  const id = rawId(userId);
  return await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${id}))`);
    const existing = await tx
      .select({ name: mcpServers.name })
      .from(mcpServers)
      .where(eq(mcpServers.userId, id));
    const isNewServer = !existing.some((row) => row.name === server.name);
    if (isNewServer && existing.length >= maxServers) {
      return 'limit-reached';
    }
    const token = server.token ? encryptSecret(server.token) : null;
    await tx
      .insert(mcpServers)
      .values({
        name: server.name,
        permission: server.permission,
        token,
        url: server.url,
        userId: id,
      })
      .onConflictDoUpdate({
        target: [mcpServers.userId, mcpServers.name],
        set: { token, url: server.url, lastError: null },
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
