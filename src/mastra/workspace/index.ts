import { join } from 'node:path';
import { RequestContext } from '@mastra/core/request-context';
import {
  LocalSkillSource,
  WORKSPACE_TOOLS,
  Workspace,
} from '@mastra/core/workspace';
import { E2BSandbox } from '@mastra/e2b';
import { z } from 'zod';
import { env } from '@/env';
import { sandbox as config } from '../config';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import { SandboxBrowser } from './browser';
import { E2BFilesystem } from './filesystem';
import { createSandbox } from './sandbox';
import {
  DELETE_FILE,
  EDIT_FILE,
  EXECUTE_COMMAND,
  FILE_STAT,
  GET_PROCESS_OUTPUT,
  GREP,
  KILL_PROCESS,
  LIST_FILES,
  READ_FILE,
  WRITE_FILE,
} from './tool-names';

const reached = new WeakSet<RequestContext>();
const unscopedSandboxKey = '__unscoped__';

function sandboxKey(requestContext: RequestContext): string {
  return channelContext(requestContext).threadId || unscopedSandboxKey;
}

// A sandbox not attached yet gets the full timeout when it connects, so only
// an attached one needs pushing out.
async function extendSandbox(sandbox: E2BSandbox): Promise<void> {
  if (!sandbox.sandboxId) {
    return;
  }
  try {
    await sandbox.retryOnDead(() => sandbox.e2b.setTimeout(config.timeout));
  } catch (error) {
    logger.debug('[sandbox] failed to extend lifetime', { error });
  }
}

export async function requireSandbox(
  requestContext: RequestContext
): Promise<E2BSandbox> {
  if (sandboxKey(requestContext) === unscopedSandboxKey) {
    throw new Error(
      'No Slack thread bound for this run, so a sandbox tool cannot run here.'
    );
  }
  const sandbox = await getSandbox(requestContext);
  if (!sandbox) {
    throw new Error('No sandbox available.');
  }
  await sandbox.ensureRunning();
  await extendSandbox(sandbox);
  return sandbox;
}

export async function getSandbox(
  requestContext: RequestContext
): Promise<E2BSandbox | undefined> {
  const sandbox = await workspace.resolveSandbox({ requestContext });
  if (!(sandbox instanceof E2BSandbox)) {
    return;
  }
  reached.add(requestContext);
  return sandbox;
}

// The `sandbox` output processor calls this on a normal turn, but that phase
// never runs on an abort or a thrown turn, so `onAbort`/`onError` call it too:
// otherwise the sandbox stays live until its own 16 minute timeout after every
// stopped turn.
export async function pauseSandbox(
  requestContext: RequestContext
): Promise<void> {
  if (!reached.has(requestContext)) {
    return;
  }
  const { threadId } = channelContext(requestContext);
  if (threadId) {
    // Dynamic: the Slack card module imports this one for the browser.
    const { endLiveView } = await import('../chat/live-view');
    await endLiveView({ threadId });
  }
  try {
    const sandbox = await getSandbox(requestContext);
    await sandbox?.retryOnDead(() => sandbox.e2b.pause());
  } catch (error) {
    logger.debug('[sandbox] failed to pause', { error });
  }
  if (threadId) {
    workspace.clearSandboxCache(threadId);
  }
}

export { sandboxPath } from './path';
export { codeModeToolNames } from './tool-names';

// Keyed by the memory thread id, which resolveThreadId makes the Slack thread
// id the sandbox is keyed by.
export const browser = new SandboxBrowser({
  sandboxFor: (threadId) =>
    requireSandbox(new RequestContext([['channel', { threadId }]])),
  onConnected: async (threadId) => {
    const { startLiveView } = await import('../chat/live-view');
    await startLiveView({ threadId });
  },
});

export const workspace: Workspace = new Workspace({
  id: 'main-workspace',
  name: 'Workspace',
  sandbox: ({ requestContext }) => {
    // Degrade instead of throw. Mastra can resolve workspace instructions
    // before a thread is bound (and a scheduled/idle wake may arrive without
    // channel context), and throwing here failed the whole turn and every
    // fallback model. A contextless run gets a shared scratch sandbox; real
    // turns still key on their own thread, so sandbox continuity is unchanged.
    return createSandbox(sandboxKey(requestContext));
  },
  filesystem: async ({ requestContext }) => {
    const sandbox = await getSandbox(requestContext);
    if (!sandbox) {
      throw new Error('No E2B sandbox available for filesystem.');
    }

    return new E2BFilesystem({
      sandbox,
      basePath: config.workdir,
    });
  },
  sandboxCacheKey: ({ requestContext }) => sandboxKey(requestContext),
  browser,
  skillSource: new LocalSkillSource({
    basePath: join(env.PROJECT_ROOT, 'workspace/skills'),
  }),
  skills: ['.'],
  tools: {
    // Custom sandbox tools extend through requireSandbox instead.
    hooks: {
      beforeToolCall: async ({ context }) => {
        const requestContext = z
          .object({ requestContext: z.instanceof(RequestContext) })
          .safeParse(context).data?.requestContext;
        const sandbox = requestContext && (await getSandbox(requestContext));
        if (sandbox) {
          await extendSandbox(sandbox);
        }
      },
    },
    [WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: {
      name: READ_FILE,
      // Images go through view_image (which types by magic bytes), not read_file:
      // read_file trusts the extension, which is how a mislabeled file becomes a
      // bad image part. Keep PDFs, which view_image does not handle.
      mediaTypes: ['application/pdf'],
    },
    [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: {
      name: WRITE_FILE,
      requireReadBeforeWrite: true,
    },
    // No read-before-write here: Mastra clears the read record after every
    // successful write, so a second edit to the same file was rejected as
    // unread. The exact-match old_string already fails on stale content.
    [WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: { name: EDIT_FILE },
    [WORKSPACE_TOOLS.FILESYSTEM.LIST_FILES]: { name: LIST_FILES },
    [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: { name: DELETE_FILE },
    [WORKSPACE_TOOLS.FILESYSTEM.FILE_STAT]: { name: FILE_STAT },
    [WORKSPACE_TOOLS.FILESYSTEM.MKDIR]: { enabled: false },
    [WORKSPACE_TOOLS.FILESYSTEM.GREP]: { name: GREP },
    [WORKSPACE_TOOLS.FILESYSTEM.AST_EDIT]: { enabled: false },
    [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: {
      name: EXECUTE_COMMAND,
      // Without this the default is the agent's own abort signal, so every
      // `background: true` process is killed the moment the turn ends. Mastra
      // documents `false` as the setting for cloud sandboxes like E2B, where
      // the process is supposed to outlive the agent that started it.
      backgroundProcesses: { abortSignal: false },
    },
    [WORKSPACE_TOOLS.SANDBOX.GET_PROCESS_OUTPUT]: {
      name: GET_PROCESS_OUTPUT,
    },
    [WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS]: { name: KILL_PROCESS },
    [WORKSPACE_TOOLS.LSP.LSP_INSPECT]: { enabled: false },
  },
});
