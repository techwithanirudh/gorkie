import { listMCPServers, setMCPServerError } from '../../db/queries/mcps';
import { logger } from '../../lib/logger';
import { cleanMCPErrorMessage } from '../errors';
import { annotatedTool, coverageKey, unlabelledServers } from './approval';
import { dropClient, mcpServerNames, resolveClient } from './client';

export async function userMCPTools({
  threadId,
  userId,
}: {
  threadId: string | undefined;
  userId: string;
}): Promise<Record<string, unknown>> {
  try {
    const servers = await listMCPServers(userId);
    if (servers.length === 0) {
      await dropClient(userId);
      return {};
    }
    if (threadId) {
      mcpServerNames.set(threadId, new Set(servers.map((s) => s.name)));
    }
    const client = await resolveClient({ servers, userId });
    const { tools, errors } = await client.listToolsWithErrors();

    for (const server of servers) {
      const own = Object.keys(tools).filter((id) =>
        id.startsWith(`${server.name}_`)
      );
      const labelled = own.some(
        (id) =>
          annotatedTool.safeParse(tools[id]).data?.mcp?.annotations
            ?.readOnlyHint !== undefined
      );
      const key = coverageKey({ serverName: server.name, userId });
      if (own.length > 0 && !labelled) {
        unlabelledServers.add(key);
      } else {
        unlabelledServers.delete(key);
      }
    }

    await Promise.all(
      servers.map((server) => {
        const rawError = errors[server.name];
        return setMCPServerError({
          userId,
          name: server.name,
          error: rawError
            ? cleanMCPErrorMessage({ serverName: server.name, raw: rawError })
            : null,
        });
      })
    );
    return tools;
  } catch (error) {
    logger.debug('[mcp] failed to list user servers', { error, userId });
    return {};
  }
}
