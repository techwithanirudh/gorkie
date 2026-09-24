import { createHash } from 'node:crypto';
import { MCPClient } from '@mastra/mcp';
import { env } from '@/env';
import { logger } from '../../lib/logger';
import { oauthRedirectUri } from '../../server/oauth-link';
import type { MCPServerConfig, StoredMCPServer } from '../../types';
import { MCPServerOAuth, mcpOAuthHosts } from '../oauth';
import { checkMCPUrl } from '../security';
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

// Re-check at connect: DNS can be re-pointed at an internal address after add.
async function checkServer({
  server,
  userId,
}: {
  server: StoredMCPServer;
  userId: string;
}) {
  if (server.credentialError) {
    return { server, error: server.credentialError };
  }
  const urlCheck = await checkMCPUrl(server.url);
  if (urlCheck.error !== undefined) {
    return { server, error: urlCheck.error };
  }
  const { url } = urlCheck;
  if (!server.oauth) {
    return { server, url };
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
  const hostErrors = await Promise.all(
    hosts.map(async (host) => (await checkMCPUrl(`https://${host}`)).error)
  );
  const hostError = hostErrors.find(Boolean);
  if (hostError) {
    return { server, error: `Sign-in server rejected: ${hostError}` };
  }
  const provider = new MCPServerOAuth({
    redirectUri: oauthRedirectUri('mcp'),
    server,
    userId,
  });
  return { server, url, oauth: { hosts, provider } };
}

// A new MCPClient under the same id disconnects the previous one itself,
// because the fresh approval functions never compare equal.
async function buildClient({
  userId,
  servers,
}: {
  userId: string;
  servers: StoredMCPServer[];
}): Promise<UserClient> {
  const checked = await Promise.all(
    servers.map((server) =>
      checkServer({ server, userId }).catch(
        (error: unknown): Awaited<ReturnType<typeof checkServer>> => {
          logger.warn('[mcp] failed to prepare server', {
            error,
            name: server.name,
            userId,
          });
          return {
            server,
            error: "Could not load this server's saved settings.",
          };
        }
      )
    )
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

  const client = new MCPClient({
    id: `user-mcp-${userId}`,
    servers: Object.fromEntries(
      checked
        .flatMap((check) => (check.url ? [check] : []))
        .map(({ server, url, oauth }) => [
          server.name,
          {
            ...serverConnection({
              server,
              url,
              ...(oauth ? { oauth } : {}),
            }),
            requireToolApproval: approvalFor(server.permission),
          },
        ])
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
        server.oauth
          ? `oauth:${server.oauth.status}:${server.oauth.connectedAt?.getTime() ?? ''}`
          : '',
        server.credentialError ? 'stopped' : '',
      ].join(' ')
    )
    .sort((a, b) => (a < b ? -1 : 1))
    .join('\n');
  const cached = clients.get(userId);
  if (cached && cached.key === key) {
    return cached.promise;
  }
  const promise = buildClient({ servers, userId });
  const entry = { key, promise };
  clients.set(userId, entry);

  promise.catch(() => {
    if (clients.get(userId) === entry) {
      clients.delete(userId);
    }
  });

  return promise;
}
