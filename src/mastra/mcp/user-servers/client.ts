import { createHash } from 'node:crypto';
import { MCPClient } from '@mastra/mcp';
import { logger } from '../../lib/logger';
import type { MCPServerConfig } from '../../types';
import { approvalFor } from './approval';

export const mcpServerNames = new Map<string, ReadonlySet<string>>();

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

const clients = new Map<string, { key: string; promise: Promise<MCPClient> }>();

async function buildClient({
  userId,
  servers,
  stale,
}: {
  userId: string;
  servers: MCPServerConfig[];
  stale: Promise<MCPClient> | undefined;
}): Promise<MCPClient> {
  if (stale) {
    const staleClient = await stale;
    await staleClient.disconnect().catch((error: unknown) => {
      logger.debug('[mcp] failed to disconnect stale client', {
        error,
        userId,
      });
    });
  }
  const client = new MCPClient({
    id: `user-mcp-${userId}`,
    servers: Object.fromEntries(
      servers.flatMap((server) => {
        let url: URL;
        try {
          url = new URL(server.url);
        } catch (error) {
          logger.debug('[mcp] skipping server with invalid url', {
            error,
            name: server.name,
            userId,
          });
          return [];
        }
        return [
          [
            server.name,
            {
              ...serverConnection({ server, url }),
              requireToolApproval: approvalFor(server.permission),
            },
          ],
        ] as const;
      })
    ),
  });
  client.__setLogger(logger);
  return client;
}

export async function dropClient(userId: string): Promise<void> {
  const cached = clients.get(userId);
  if (!cached) {
    return;
  }
  clients.delete(userId);
  try {
    const client = await cached.promise;
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
}): Promise<MCPClient> {
  // Tokens are hashed, never stringified, so a bearer token cannot become a
  // map key; the sort keeps it stable when rows come back reordered.
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
