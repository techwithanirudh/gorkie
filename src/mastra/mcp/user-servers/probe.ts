import { MCPClient } from '@mastra/mcp';
import { logger } from '../../lib/logger';
import type { MCPServerConfig } from '../../types';
import { cleanMCPErrorMessage } from '../errors';

export async function findMCPConnectionError({
  userId,
  server,
}: {
  userId: string;
  server: MCPServerConfig;
}): Promise<string | undefined> {
  const url = new URL(server.url);
  const probe = new MCPClient({
    id: `mcp-probe-${userId}-${server.name}`,
    servers: {
      [server.name]: {
        connectTimeout: 2000,
        url,
        allowedHosts: [url.host],
        ...(server.token
          ? {
              requestInit: {
                headers: { Authorization: `Bearer ${server.token}` },
              },
            }
          : {}),
      },
    },
  });
  probe.__setLogger(logger);
  try {
    const { errors } = await probe.listToolsWithErrors();
    const error = errors[server.name];
    if (error) {
      logger.debug('[mcp] connection check failed', {
        error,
        name: server.name,
        userId,
      });
      return cleanMCPErrorMessage({ serverName: server.name, raw: error });
    }
  } catch (error) {
    logger.debug('[mcp] connection check failed', {
      error,
      name: server.name,
      userId,
    });
    return cleanMCPErrorMessage({
      serverName: server.name,
      raw: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await probe.disconnect().catch(() => {
      // Best effort: the probe client is thrown away either way.
    });
  }
}
