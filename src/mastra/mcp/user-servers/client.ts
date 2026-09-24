import { createHash } from 'node:crypto';
import { MCPClient } from '@mastra/mcp';
import { env } from '@/env';
import { logger } from '../../lib/logger';
import type { MCPServerConfig, StoredMCPServer } from '../../types';
import { findMCPOAuthHostError, MCPServerOAuth, mcpOAuthHosts } from '../oauth';
import { findMCPUrlError } from '../security';
import { approvalFor } from './approval';

export function serverConnection({
  oauth,
  server,
  url,
}: {
  oauth?: { hosts: string[]; provider: MCPServerOAuth };
  server: MCPServerConfig;
  url: URL;
}) {
  return {
    url,
    // The SDK sends OAuth discovery, refresh and token requests through the
    // transport's fetch, so the authorization server hosts must be allowed too.
    allowedHosts: oauth ? [url.host, ...oauth.hosts] : [url.host],
    ...(oauth ? { authProvider: oauth.provider } : {}),
    ...(server.token && !oauth
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
  servers: StoredMCPServer[];
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
    servers.map(async (server) => {
      if (server.credentialError) {
        return { server, error: server.credentialError };
      }
      const urlError = await findMCPUrlError(server.url);
      if (urlError || !server.oauth) {
        return { server, error: urlError };
      }
      if (!env.PUBLIC_BASE_URL) {
        return { server, error: 'OAuth sign-in is not set up on this Gorkie.' };
      }
      if (server.oauth.status !== 'connected') {
        return {
          server,
          error:
            server.oauth.status === 'needs-auth'
              ? 'Sign-in expired or was revoked. Press Reconnect on this server in the Home tab.'
              : 'Not signed in yet. Press Connect on this server in the Home tab.',
        };
      }
      const hosts = await mcpOAuthHosts({ name: server.name, userId });
      const hostError = await findMCPOAuthHostError(hosts);
      if (hostError) {
        return { server, error: `Sign-in server rejected: ${hostError}` };
      }
      const provider = new MCPServerOAuth({
        redirectUri: `${env.PUBLIC_BASE_URL}/oauth/mcp/callback`,
        server,
        userId,
      });
      return { server, error: undefined, oauth: { hosts, provider } };
    })
  );
  const rejected = new Map<string, string>();
  for (const { server, error } of checked) {
    if (error) {
      logger.warn('[mcp] server not connected at build', {
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
        .map(({ server, oauth }) => {
          const url = new URL(server.url);
          return [
            server.name,
            {
              ...serverConnection({
                server,
                url,
                ...(oauth ? { oauth } : {}),
              }),
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
  servers: StoredMCPServer[];
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
        // A refresh keeps the client; a reconnect (new connectedAt) rebuilds it.
        server.oauth
          ? `oauth:${server.oauth.status}:${server.oauth.connectedAt?.getTime() ?? ''}`
          : '',
        // A server that just failed auth drops out of the cached client.
        server.credentialError ? 'stopped' : '',
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
