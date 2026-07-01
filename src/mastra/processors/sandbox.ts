import type {
  ProcessOutputResultArgs,
  ProcessOutputStepArgs,
} from '@mastra/core/processors';
import type { E2BSandbox } from '@mastra/e2b';
import { sandbox as config } from '../config';
import { workspace } from '../workspace';

const sandboxTools = new Set([
  'execute_command',
  'get_process_output',
  'kill_process',
  'get_file',
  'upload_file',
  'read_file',
  'write_file',
  'edit_file',
  'list_files',
  'delete_file',
  'file_stat',
  'mkdir',
  'grep',
  'ast_edit',
]);

export const sandbox = {
  id: 'sandbox',
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
        const sandbox = (await workspace.resolveSandbox({ requestContext })) as
          | E2BSandbox
          | undefined;
        await sandbox?.retryOnDead(() =>
          sandbox.e2b.setTimeout(config.timeout)
        );
      } catch {
        /* not started */
      }
    }
    return messages;
  },
  async processOutputResult(args: ProcessOutputResultArgs) {
    const { requestContext, messages } = args;
    if (requestContext) {
      try {
        const sandbox = (await workspace.resolveSandbox({ requestContext })) as
          | E2BSandbox
          | undefined;
        await sandbox?.retryOnDead(() => sandbox.e2b.pause());
      } catch {
        /* not started / already paused */
      }
    }
    return messages;
  },
};
