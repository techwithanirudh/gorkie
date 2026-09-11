import { listMCPServers, setMCPServerError } from '../../db/queries/mcps';
import { logger } from '../../lib/logger';
import { cleanMCPErrorMessage } from '../errors';
import { annotationCoverage, readOnlyHintOf } from './approval';
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

    const counts = new Map<string, { annotated: number; total: number }>();
    for (const [id, tool] of Object.entries(tools)) {
      const server = servers.find((entry) =>
        id.startsWith(`${entry.name}_`)
      )?.name;
      if (!server) {
        continue;
      }
      const seen = counts.get(server) ?? { annotated: 0, total: 0 };
      seen.total += 1;
      if (readOnlyHintOf(tool) !== undefined) {
        seen.annotated += 1;
      }
      counts.set(server, seen);
    }
    for (const server of servers) {
      annotationCoverage.set(
        `${userId}:${server.name}`,
        counts.get(server.name) ?? { annotated: 0, total: 0 }
      );
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
