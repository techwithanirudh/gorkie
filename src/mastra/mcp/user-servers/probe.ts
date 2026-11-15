import { MCPClient } from '@mastra/mcp';
import { logger } from '../../lib/logger';
import type { MCPServerConfig } from '../../types';
import { describeMCPError } from '../errors';
import { serverConnection } from './client';

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
        ...serverConnection({ server, url }),
      },
    },
  });
  probe.__setLogger(logger);
  try {
    const { errorDetails } = await probe.listToolsWithErrors();
    const details = errorDetails[server.name];
    if (details) {
      logger.debug('[mcp] connection check failed', {
        error: details,
        name: server.name,
        userId,
      });
      return await describeMCPError({ server, details });
    }
  } catch (error) {
    logger.debug('[mcp] connection check failed', {
      error,
      name: server.name,
      userId,
    });
    return await describeMCPError({
      server,
      details: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
  } finally {
    await probe
      .disconnect()
      .catch((error: unknown) =>
        logger.debug('[mcp] probe disconnect failed', { error })
      );
  }
}
