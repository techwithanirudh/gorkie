import type {
  ComputeStateSignalArgs,
  Processor,
} from '@mastra/core/processors';
import { listMCPServers } from '../db/queries/mcps';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import { mcpDownPrompt, mcpUpPrompt } from '../prompts/processors';

// Signalled rather than put in the system prompt, so a server going down or
// coming back does not void the prompt cache for the whole thread.
export const mcpStatus = {
  id: 'mcp-status',
  stateId: 'mcps',
  name: 'MCP Status',
  description: "Tells the model when one of the person's MCP servers is down.",
  async computeStateSignal({
    requestContext,
    tracking,
  }: ComputeStateSignalArgs) {
    const { userId } = channelContext(requestContext);
    if (!userId) {
      return;
    }
    const failed = (
      await listMCPServers(userId).catch((error: unknown) => {
        logger.debug('[mcp-status] could not load servers', { error, userId });
        return [];
      })
    )
      .filter((server) => server.lastError)
      .map((server) => server.name);
    if (failed.length > 0) {
      return {
        mode: 'snapshot' as const,
        cacheKey: failed.join('|'),
        contents: mcpDownPrompt(failed),
      };
    }
    if (tracking?.currentCacheKey && tracking.currentCacheKey !== 'up') {
      return {
        mode: 'snapshot' as const,
        cacheKey: 'up',
        contents: mcpUpPrompt,
      };
    }
  },
} satisfies Processor;
