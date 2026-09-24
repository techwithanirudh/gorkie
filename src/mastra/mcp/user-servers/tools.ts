import type { ToolsInput } from '@mastra/core/agent';
import { listMCPServers, setMCPServerError } from '../../db/queries/mcps';
import { getUserSettings } from '../../db/queries/settings';
import { logger } from '../../lib/logger';
import { describeMCPError } from '../errors';
import { dropClient, resolveClient } from './client';

// Process memory, so the Home warning is gone after a restart until the
// user's next turn lists tools again.
export const unlabelledServers = new Set<string>();

export const coverageKey = ({
  serverName,
  userId,
}: {
  serverName: string;
  userId: string;
}): string => `${userId}:${serverName}`;

export async function userMCPTools({
  isDM,
  userId,
}: {
  isDM: boolean;
  userId: string;
}): Promise<ToolsInput> {
  try {
    if (!(isDM || (await getUserSettings(userId)).mcpThreads)) {
      return {};
    }
    const servers = await listMCPServers(userId);
    if (servers.length === 0) {
      await dropClient(userId);
      return {};
    }
    const { client, rejected } = await resolveClient({ servers, userId });
    const { toolsets, errorDetails } = await client.listToolsetsWithErrors();

    for (const server of servers) {
      const own = Object.values(toolsets[server.name] ?? {});
      const labelled = own.some(
        (tool) => tool.mcp?.annotations?.readOnlyHint !== undefined
      );
      const key = coverageKey({ serverName: server.name, userId });
      if (own.length > 0 && !labelled) {
        unlabelledServers.add(key);
      } else {
        unlabelledServers.delete(key);
      }
    }

    await Promise.all(
      servers.map(async (server) => {
        const details = errorDetails[server.name];
        const error =
          rejected.get(server.name) ??
          (details ? await describeMCPError({ server, details }) : null);
        if (error === (server.lastError ?? null)) {
          return;
        }
        await setMCPServerError({
          userId,
          name: server.name,
          error,
          httpStatus: rejected.has(server.name)
            ? undefined
            : details?.httpStatus,
        }).catch((writeError: unknown) => {
          logger.warn('[mcp] failed to record server error', {
            error: writeError,
            name: server.name,
            userId,
          });
        });
      })
    );
    return Object.fromEntries(
      Object.entries(toolsets).flatMap(([serverName, tools]) =>
        Object.entries(tools).map(([toolName, tool]) => [
          `${serverName}_${toolName}`,
          tool,
        ])
      )
    );
  } catch (error) {
    logger.warn('[mcp] failed to list user servers', { error, userId });
    return {};
  }
}
