import type { ToolsInput } from '@mastra/core/agent';
import { listMCPServers, setMCPServerError } from '../../db/queries/mcps';
import { logger } from '../../lib/logger';
import { describeMCPError } from '../errors';
import { dropClient, resolveClient } from './client';

// TODO(slopradar): hidden shared state : a module-global Set written per turn here and read by app-home/mcp/views.ts, empty after a restart so Home hides the warning until the next turn → persist the flag on the server row (schema change: ask) or have Home derive it from the cached client's toolsets
export const unlabelledServers = new Set<string>();

export const coverageKey = ({
  serverName,
  userId,
}: {
  serverName: string;
  userId: string;
}): string => `${userId}:${serverName}`;

// TODO(slopradar): long function : ~75 lines doing listing, unlabelled bookkeeping, error recording and key flattening → split the label scan and the error write into named module functions called from here
export async function userMCPTools({
  isDM,
  userId,
}: {
  isDM: boolean;
  userId: string;
}): Promise<ToolsInput> {
  try {
    const servers = await listMCPServers(userId);
    if (servers.length === 0) {
      await dropClient(userId);
      return {};
    }
    const allowed = new Set(
      servers.filter((server) => isDM || server.threads).map(({ name }) => name)
    );
    if (allowed.size === 0) {
      return {};
    }
    // The client is cached per user and keyed on the full server list. Building
    // it from a subset would rebuild it on every DM and thread switch, and a new
    // client under the same id disconnects the one a parallel turn is using.
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
      Object.entries(toolsets)
        .filter(([serverName]) => allowed.has(serverName))
        .flatMap(([serverName, tools]) =>
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
