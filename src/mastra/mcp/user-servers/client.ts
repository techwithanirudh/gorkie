import { createHash } from 'node:crypto';
import { MCPClient } from '@mastra/mcp';
import { logger } from '../../lib/logger';
import type { MCPServerConfig } from '../../types';
import { findMCPUrlError } from '../security';
import { approvalFor } from './approval';

export function serverConnection({
  server,
  url,
}: {
  server: MCPServerConfig;
  url: URL;
}) {
  return {
    url,
    allowedHosts: [url.host],
    ...(server.token
      ? {
          requestInit: {
            headers: { Authorization: `Bearer ${server.token}` },
          },
        }
      : {}),
  };
}

interface UserClient {
  client: MCPClient;
  rejected: Map<string, string>;
}

const clients = new Map<
  string,
  { key: string; promise: Promise<UserClient> }
>();

async function buildClient({
  userId,
  servers,
  stale,
}: {
  userId: string;
  servers: MCPServerConfig[];
  stale: Promise<UserClient> | undefined;
}): Promise<UserClient> {
  // A stale client that never connected has nothing to disconnect.
  const staleClient = await stale?.catch(() => undefined);
  if (staleClient) {
    await staleClient.client.disconnect().catch((error: unknown) => {
      logger.debug('[mcp] failed to disconnect stale client', {
        error,
        userId,
      });
    });
  }
  // Re-check at connect: DNS can be re-pointed at an internal address after add.
  const checked = await Promise.all(
    servers.map(async (server) => ({
      server,
      error: await findMCPUrlError(server.url),
    }))
  );
  const rejected = new Map<string, string>();
  for (const { server, error } of checked) {
    if (error) {
      logger.warn('[mcp] server failed url revalidation at connect', {
        error,
        name: server.name,
        userId,
      });
      rejected.set(server.name, error);
    }
  }

  // findMCPUrlError already rejected any url that fails to parse.
  const client = new MCPClient({
    id: `user-mcp-${userId}`,
    servers: Object.fromEntries(
      checked
        .filter(({ error }) => !error)
        .map(({ server }) => {
          const url = new URL(server.url);
          return [
            server.name,
            {
              ...serverConnection({ server, url }),
              requireToolApproval: approvalFor(server.permission),
            },
          ];
        })
    ),
  });
  client.__setLogger(logger);
  return { client, rejected };
}

export async function dropClient(userId: string): Promise<void> {
  const cached = clients.get(userId);
  if (!cached) {
    return;
  }
  clients.delete(userId);
  try {
    const { client } = await cached.promise;
    await client.disconnect();
  } catch (error) {
    logger.debug('[mcp] failed to disconnect client on removal', {
      error,
      userId,
    });
  }
}

export function resolveClient({
  userId,
  servers,
}: {
  userId: string;
  servers: MCPServerConfig[];
}): Promise<UserClient> {
  const key = servers
    .map((server) =>
      [
        server.name,
        server.url,
        server.permission,
        server.token
          ? createHash('sha256').update(server.token).digest('hex').slice(0, 16)
          : '',
      ].join(' ')
    )
    .sort((a, b) => (a < b ? -1 : 1))
    .join('\n');
  const cached = clients.get(userId);
  if (cached && cached.key === key) {
    return cached.promise;
  }
  const promise = buildClient({ servers, stale: cached?.promise, userId });
  const entry = { key, promise };
  clients.set(userId, entry);

  promise.catch(() => {
    if (clients.get(userId) === entry) {
      clients.delete(userId);
    }
  });

  return promise;
}
