import type { ToolsInput } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import type { MCPClient } from '@mastra/mcp';
import { listMCPServers, setMCPServerError } from '../../db/queries/mcps';
import { logger } from '../../lib/logger';
import type { StoredMCPServer } from '../../types';
import { describeMCPError } from '../errors';
import { dropClient, resolveClient } from './client';

type Listing = Awaited<ReturnType<MCPClient['listToolsetsWithErrors']>>;

function recordLabels({
  servers,
  toolsets,
  unlabelled,
}: {
  servers: StoredMCPServer[];
  toolsets: Listing['toolsets'];
  unlabelled: Set<string>;
}): void {
  for (const server of servers) {
    const own = Object.values(toolsets[server.name] ?? {});
    const labelled = own.some(
      (tool) => tool.mcp?.annotations?.readOnlyHint !== undefined
    );
    if (own.length > 0 && !labelled) {
      unlabelled.add(server.name);
    } else {
      unlabelled.delete(server.name);
    }
  }
}

async function recordErrors({
  errorDetails,
  rejected,
  servers,
  userId,
}: {
  errorDetails: Listing['errorDetails'];
  rejected: Map<string, string>;
  servers: StoredMCPServer[];
  userId: string;
}): Promise<void> {
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
        httpStatus: rejected.has(server.name) ? undefined : details?.httpStatus,
      }).catch((writeError: unknown) => {
        logger.warn('[mcp] failed to record server error', {
          error: writeError,
          name: server.name,
          userId,
        });
      });
    })
  );
}

const serversPerRequest = new WeakMap<
  RequestContext,
  Promise<StoredMCPServer[]>
>();

export function requestServers({
  requestContext,
  userId,
}: {
  requestContext: RequestContext;
  userId: string;
}): Promise<StoredMCPServer[]> {
  const cached = serversPerRequest.get(requestContext);
  if (cached) {
    return cached;
  }
  const started = listMCPServers(userId);
  serversPerRequest.set(requestContext, started);
  return started;
}

export async function userMCPTools({
  isDM,
  requestContext,
  userId,
}: {
  isDM: boolean;
  requestContext: RequestContext;
  userId: string;
}): Promise<ToolsInput> {
  try {
    const servers = await requestServers({ requestContext, userId });
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
    const { client, rejected, unlabelled } = await resolveClient({
      servers,
      userId,
    });
    const { toolsets, errorDetails } = await client.listToolsetsWithErrors();
    recordLabels({ servers, toolsets, unlabelled });
    await recordErrors({ errorDetails, rejected, servers, userId });
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
