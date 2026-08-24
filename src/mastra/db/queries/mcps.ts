import { sql } from 'kysely';
import { rawId } from '../../lib/ids';
import type { MCPServerConfig } from '../../types';
import { db } from '../client';

export async function listMCPServers(
  userId: string
): Promise<(MCPServerConfig & { lastError?: string })[]> {
  const rows = await db
    .selectFrom('mcp_servers')
    .select(['name', 'url', 'token', 'last_error'])
    .where('user_id', '=', rawId(userId))
    .orderBy('created_at', 'asc')
    .execute();
  return rows.map((row) => ({
    name: row.name,
    token: row.token ?? undefined,
    url: row.url,
    lastError: row.last_error ?? undefined,
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
    .updateTable('mcp_servers')
    .set({ last_error: error })
    .where('user_id', '=', rawId(userId))
    .where('name', '=', name)
    .execute();
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
  return await db.transaction().execute(async (trx) => {
    // Serialize per user so two concurrent submits can't both observe room
    // under maxServers and both insert, pushing the count past it.
    await sql`select pg_advisory_xact_lock(hashtext(${id}))`.execute(trx);
    const existing = await trx
      .selectFrom('mcp_servers')
      .select('name')
      .where('user_id', '=', id)
      .execute();
    const isNewServer = !existing.some((row) => row.name === server.name);
    if (isNewServer && existing.length >= maxServers) {
      return 'limit-reached';
    }
    await trx
      .insertInto('mcp_servers')
      .values({
        name: server.name,
        token: server.token ?? null,
        url: server.url,
        user_id: id,
      })
      .onConflict((oc) =>
        oc.columns(['user_id', 'name']).doUpdateSet({
          token: server.token ?? null,
          url: server.url,
          last_error: null,
        })
      )
      .execute();
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
    .deleteFrom('mcp_servers')
    .where('user_id', '=', rawId(userId))
    .where('name', '=', name)
    .execute();
}
