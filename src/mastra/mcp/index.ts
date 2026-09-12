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
  listed ??= client.listTools();
  return listed;
}
