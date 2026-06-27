import { Workspace } from '@mastra/core/workspace';
import { E2BSandbox } from '@mastra/e2b';
import { MASTRA_THREAD_ID_KEY } from '@mastra/core/request-context';
import type { RequestContext } from '@mastra/core/request-context';
import type {
  ProcessOutputStepArgs,
  ProcessOutputResultArgs,
} from '@mastra/core/processors';
import { channelContext } from '../types';
import { env } from '../../env';

const SANDBOX_MS = 300_000;
const SANDBOX_TOOL = /execute_command|check_process|kill_process|get_file|upload_file/;

function threadKey(requestContext: RequestContext): string | undefined {
  const key =
    channelContext(requestContext).threadId ??
    (requestContext.get(MASTRA_THREAD_ID_KEY) as string | undefined);
  console.error(`[sandbox-key] key=${key ?? 'NULL'}`);
  return key;
}

async function sandboxFor(
  requestContext: RequestContext,
): Promise<E2BSandbox | undefined> {
  return (await workspace.resolveSandbox({ requestContext })) as
    | E2BSandbox
    | undefined;
}

export const workspace = new Workspace({
  id: 'gorkie-workspace',
  name: 'gorkie',
  sandbox: () =>
    new E2BSandbox({
      apiKey: env.E2B_API_KEY,
      timeout: SANDBOX_MS,
      instructions: [
        'You have a persistent E2B Linux sandbox (Debian, Node.js, Python 3) for this conversation, driven by `execute_command`.',
        'Read, write, and edit files with shell commands (`cat`, `tee`, `sed`); install tools before first use (`apt-get`, `pip3`, `npm`).',
        'Verify your work by running it before claiming it works; read stderr and fix failures instead of re-running the same failing command.',
        'The sandbox persists across turns in this thread, so files and installed tools you create stay available. Files are not visible in chat unless you post them back.',
      ].join(' '),
    }),
  sandboxCacheKey: ({ requestContext }) => threadKey(requestContext),
});

export const sandboxLifecycle = {
  id: 'sandbox-lifecycle',
  async processOutputStep(args: ProcessOutputStepArgs) {
    const { toolCalls, requestContext, messages } = args;
    if (requestContext && toolCalls?.some((t) => SANDBOX_TOOL.test(t.toolName))) {
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
