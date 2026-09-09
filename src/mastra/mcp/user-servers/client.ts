import { MCPClient } from '@mastra/mcp';
import { logger } from '../../lib/logger';
import type { MCPServerConfig } from '../../types';
import { approvalFor } from './approval';

export const mcpServerNames = new Set<string>();

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
              url,
              requireToolApproval: approvalFor(server.permission),
              allowedHosts: [url.host],
              ...(server.token
                ? {
                    requestInit: {
                      headers: { Authorization: `Bearer ${server.token}` },
                    },
                  }
                : {}),
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
  const key = JSON.stringify(servers);
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
