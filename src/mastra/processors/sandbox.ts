import type {
  ProcessOutputResultArgs,
  ProcessToolResultArgs,
} from '@mastra/core/processors';
import { sandbox as sandboxConfig } from '../config';
import { logger } from '../lib/logger';
import {
  getSandbox,
  pauseSandbox,
  usedSandbox,
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
    if (requestContext) {
      await pauseSandbox(requestContext);
    }
    return messages;
  },
};
