import type { ToolsInput } from '@mastra/core/agent';
import { listMCPServers, setMCPServerError } from '../../db/queries/mcps';
import { logger } from '../../lib/logger';
import { cleanMCPErrorMessage } from '../errors';
import { coverageKey, unlabelledServers } from './approval';
import { dropClient, resolveClient } from './client';

export async function userMCPTools({
  userId,
}: {
  userId: string;
}): Promise<ToolsInput> {
  try {
    const servers = await listMCPServers(userId);
    if (servers.length === 0) {
      await dropClient(userId);
      return {};
    }
    const { client, rejected } = await resolveClient({ servers, userId });
    const { tools, errors } = await client.listToolsWithErrors();

    const ownerOf = new Map<string, string>();
    for (const id of Object.keys(tools)) {
      // Longest prefix wins, so servers `a` and `a_b` do not both claim `a_b_*` tools.
      const [owner] = servers
        .map((server) => server.name)
        .filter((name) => id.startsWith(`${name}_`))
        .sort((left, right) => right.length - left.length);
      if (owner) {
        ownerOf.set(id, owner);
      }
    }

    for (const server of servers) {
      const own = Object.keys(tools).filter(
        (id) => ownerOf.get(id) === server.name
      );
      const labelled = own.some(
        (id) => tools[id]?.mcp?.annotations?.readOnlyHint !== undefined
      );
      const key = coverageKey({ serverName: server.name, userId });
      if (own.length > 0 && !labelled) {
        unlabelledServers.add(key);
      } else {
        unlabelledServers.delete(key);
      }
    }

    await Promise.all(
      servers.flatMap((server) => {
        const rawError = errors[server.name];
        const error =
          rejected.get(server.name) ??
          (rawError
            ? cleanMCPErrorMessage({ serverName: server.name, raw: rawError })
            : null);
        if (error === (server.lastError ?? null)) {
          return [];
        }
        return [
          setMCPServerError({ userId, name: server.name, error }).catch(
            (writeError: unknown) => {
              logger.warn('[mcp] failed to record server error', {
                error: writeError,
                name: server.name,
                userId,
              });
            }
          ),
        ];
      })
    );
    return tools;
  } catch (error) {
    logger.debug('[mcp] failed to list user servers', { error, userId });
    return {};
  }
}
