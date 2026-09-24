import { MCPClient } from '@mastra/mcp';
import { logger } from '../lib/logger';

const client = new MCPClient({
  id: 'mcp',
  servers: {
    context7: {
      url: new URL('https://mcp.context7.com/mcp'),
      allowedHosts: ['mcp.context7.com'],
    },
  },
});
client.__setLogger(logger);

type MCPTools = Awaited<ReturnType<MCPClient['listTools']>>;

let listed: Promise<MCPTools> | undefined;

export function mcpTools(): Promise<MCPTools> {
  if (listed) {
    return listed;
  }
  const listing = client.listToolsWithErrors().then(
    ({ tools, errors }) => {
      // A server that fails to list is dropped from `tools`, not thrown, so
      // leave a partial listing uncached and retry it next turn.
      if (Object.keys(errors).length > 0 && listed === listing) {
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
