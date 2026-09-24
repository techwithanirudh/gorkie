import { MCPClient } from '@mastra/mcp';
import { mcp as mcpConfig } from '../../config';
import { logger } from '../../lib/logger';
import type { MCPServerConfig } from '../../types';
import { describeMCPError } from '../errors';
import { serverConnection } from './client';

export async function probeMCPConnection({
  userId,
  server,
}: {
  userId: string;
  server: MCPServerConfig;
}): Promise<{ error: string | null; httpStatus: number | undefined }> {
  const url = new URL(server.url);
  // TODO(slopradar): review: correctness (low) | a fixed id makes a concurrent probe of the same server (double-submitted modal) get the existing instance back (node_modules/@mastra/mcp/dist/index.js:23349-23360) and the first probe's `finally` disconnect kills the second; a different-config probe with the same id disconnects the in-flight one | suffix the id with crypto.randomUUID()
  const probe = new MCPClient({
    id: `mcp-probe-${userId}-${server.name}`,
    servers: {
      [server.name]: {
        connectTimeout: mcpConfig.probeTimeoutMs,
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
      return {
        error: await describeMCPError({ server, details }),
        httpStatus: details.httpStatus,
      };
    }
  } catch (error) {
    logger.debug('[mcp] connection check failed', {
      error,
      name: server.name,
      userId,
    });
    return {
      error: await describeMCPError({
        server,
        details: {
          message: error instanceof Error ? error.message : String(error),
        },
      }),
      httpStatus: undefined,
    };
  } finally {
    await probe
      .disconnect()
      .catch((error: unknown) =>
        logger.debug('[mcp] probe disconnect failed', { error })
      );
  }
  return { error: null, httpStatus: undefined };
}
