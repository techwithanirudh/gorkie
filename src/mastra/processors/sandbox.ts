import type {
  ProcessOutputResultArgs,
  ProcessOutputStepArgs,
} from '@mastra/core/processors';
import { sandbox as sandboxConfig } from '../config';
import { logger } from '../lib/logger';
import { getSandbox, workspaceToolNames } from '../workspace';

const sandboxTools = new Set([
  ...workspaceToolNames,
  'slack',
  'get_slack_file',
  'upload_file',
  'github_checkout',
  'github_push_branch',
]);

export const sandbox = {
  id: 'sandbox',
  name: 'Sandbox Lifecycle',
  description:
    'Extends sandbox lifetime during active tool use, then pauses it once the turn finishes.',
  async processOutputStep(args: ProcessOutputStepArgs) {
    const { toolCalls, requestContext, messages } = args;
    if (
      requestContext &&
      toolCalls?.some(
        (t) =>
          t.toolName.startsWith('mastra_workspace_') ||
          sandboxTools.has(t.toolName)
      )
    ) {
      try {
        const sandbox = await getSandbox(requestContext);
        await sandbox?.retryOnDead(() =>
          sandbox.e2b.setTimeout(sandboxConfig.timeout)
        );
      } catch (error) {
        logger.debug('[sandbox] failed to extend lifetime', { error });
        return messages;
      }
    }
    return messages;
  },
  async processOutputResult(args: ProcessOutputResultArgs) {
    const { requestContext, messages } = args;
    if (requestContext) {
      try {
        const sandbox = await getSandbox(requestContext);
        await sandbox?.retryOnDead(() => sandbox.e2b.pause());
      } catch (error) {
        logger.debug('[sandbox] failed to pause', { error });
      }
    }
    return messages;
  },
};
