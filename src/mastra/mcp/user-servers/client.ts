import { createHash } from 'node:crypto';
import { MCPClient } from '@mastra/mcp';
import { setMCPServerError } from '../../db/queries/mcps';
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
  // A previous build that failed has nothing to disconnect.
  const staleClient = await stale?.catch(() => undefined);
  if (staleClient) {
    await staleClient.disconnect().catch((error: unknown) => {
      logger.debug('[mcp] failed to disconnect stale client', {
        error,
        userId,
      });
    });
  }
  // Re-run the SSRF URL check at connect, not just when the server was added:
  // a hostname that resolved to a public address at add time can be re-pointed
  // to an internal one (DNS rebinding), so re-resolve here and drop any that
  // now fail, surfacing the reason in App Home via lastError.
  const checked = await Promise.all(
    servers.map(async (server) => ({
      server,
      error: await findMCPUrlError(server.url),
    }))
  );
  const valid = checked.filter((c) => !c.error).map((c) => c.server);
  await Promise.all(
    checked
      .filter((c) => c.error)
      .map(({ server, error }) => {
        logger.warn('[mcp] server failed url revalidation at connect', {
          error,
          name: server.name,
          userId,
        });
        return setMCPServerError({
          userId,
          name: server.name,
          error: error ?? null,
        }).catch((writeError: unknown) => {
          logger.debug('[mcp] failed to record revalidation error', {
            error: writeError,
            name: server.name,
            userId,
          });
        });
      })
  );

  const client = new MCPClient({
    id: `user-mcp-${userId}`,
    servers: Object.fromEntries(
      valid.flatMap((server) => {
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
