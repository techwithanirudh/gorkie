import { MCPClient } from '@mastra/mcp';
import { logger } from '../lib/logger';

const client = new MCPClient({
  id: 'mcp',
  servers: {
    context7: {
      url: new URL('https://mcp.context7.com/mcp'),
    },
  },
});
client.__setLogger(logger);

let listed: ReturnType<MCPClient['listTools']> | undefined;

export function mcpTools(): ReturnType<MCPClient['listTools']> {
  if (listed) {
    return listed;
  }
  const listing = client.listTools().then(
    (tools) => {
      // An unreachable server lists as {}, so leave it uncached and retry next turn.
      if (Object.keys(tools).length === 0 && listed === listing) {
        listed = undefined;
      }
      return tools;
    },
    (error: unknown) => {
      if (listed === listing) {
        listed = undefined;
      }
      throw error;
    }
  );
  listed = listing;
  return listing;
}
