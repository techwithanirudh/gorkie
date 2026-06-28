import type { RequestContext } from '@mastra/core/request-context';
import type {
  ProcessOutputStepArgs,
  ProcessOutputResultArgs,
} from '@mastra/core/processors';
import type { E2BSandbox } from '@mastra/e2b';
import { workspace } from './index';

const SANDBOX_MS = 300_000;

async function sandboxFor(requestContext: RequestContext): Promise<E2BSandbox | undefined> {
  return (await workspace.resolveSandbox({ requestContext })) as E2BSandbox | undefined;
}

export const sandboxLifecycle = {
  id: 'sandbox-lifecycle',
  async processOutputStep(args: ProcessOutputStepArgs) {
    const { toolCalls, requestContext, messages } = args;
    if (
      requestContext &&
      toolCalls?.some(
        (t) =>
          t.toolName.startsWith('mastra_workspace_') ||
          ['get_file', 'upload_file'].includes(t.toolName),
      )
    ) {
      try {
        await (await sandboxFor(requestContext))?.e2b.setTimeout(SANDBOX_MS);
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
        await (await sandboxFor(requestContext))?.e2b.pause();
      } catch {
        /* not started / already paused */
      }
    }
    return messages;
  },
};
