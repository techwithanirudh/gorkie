import type {
  ProcessOutputResultArgs,
  ProcessToolResultArgs,
} from '@mastra/core/processors';
import { sandbox as sandboxConfig } from '../config';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import {
  getSandbox,
  usedSandbox,
  workspace,
  workspaceToolNames,
} from '../workspace';

export const sandbox = {
  id: 'sandbox',
  name: 'Sandbox Lifecycle',
  description:
    'Extends sandbox lifetime during active tool use, then pauses it once the turn finishes.',
  async processToolResult(args: ProcessToolResultArgs) {
    const { requestContext, toolName } = args;
    if (!requestContext) {
      return;
    }
    // `execute_command` and the two process tools resolve the sandbox through
    // Mastra rather than through `getSandbox`, so they never set the flag and
    // are recognised by name instead.
    if (!(usedSandbox(requestContext) || workspaceToolNames.has(toolName))) {
      return;
    }
    try {
      const sandbox = await getSandbox(requestContext);
      await sandbox?.retryOnDead(() =>
        sandbox.e2b.setTimeout(sandboxConfig.timeout)
      );
    } catch (error) {
      logger.debug('[sandbox] failed to extend lifetime', { error });
    }
  },
  async processOutputResult(args: ProcessOutputResultArgs) {
    const { requestContext, messages } = args;
    if (requestContext && usedSandbox(requestContext)) {
      try {
        const sandbox = await getSandbox(requestContext);
        await sandbox?.retryOnDead(() => sandbox.e2b.pause());
      } catch (error) {
        logger.debug('[sandbox] failed to pause', { error });
      }
      // `sandboxCacheKey` memoizes into a plain Map that nothing else evicts,
      // so without this every thread leaves an entry for the process lifetime.
      const { threadId } = channelContext(requestContext);
      if (threadId) {
        workspace.clearSandboxCache(threadId);
      }
    }
    return messages;
  },
};
