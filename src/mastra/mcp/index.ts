import { MCPClient } from '@mastra/mcp';
import { logger } from '../lib/logger';

// MCPClient is standalone, not registered on the Mastra instance, so it keeps
// its default console logger unless we hand it ours.
const client = new MCPClient({
  id: 'mcp',
  servers: {
    context7: {
      url: new URL('https://mcp.context7.com/mcp'),
    },
  },
});
client.__setLogger(logger);

export const mcpTools = await client.listTools();
