import type {
  ProcessOutputResultArgs,
  ProcessOutputStepArgs,
} from '@mastra/core/processors';
import type { E2BSandbox } from '@mastra/e2b';
import { workspace } from '../workspace';

const SANDBOX_MS = 300_000;

export const sandboxLifecycle = {
  id: 'sandbox-lifecycle',
  async processOutputStep(args: ProcessOutputStepArgs) {
    const { toolCalls, requestContext, messages } = args;
    if (
      requestContext &&
      toolCalls?.some((t) =>
        [
          'execute_command',
          'get_process_output',
          'kill_process',
          'get_file',
          'upload_file',
        ].includes(t.toolName)
      )
    ) {
      try {
        const sandbox = (await workspace.resolveSandbox({ requestContext })) as
          | E2BSandbox
          | undefined;
        await sandbox?.e2b.setTimeout(SANDBOX_MS);
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
        await sandbox?.e2b.pause();
      } catch {
        /* not started / already paused */
      }
    }
    return messages;
  },
};
