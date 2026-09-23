import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RequestContext } from '@mastra/core/request-context';
import {
  LocalSkillSource,
  WORKSPACE_TOOLS,
  Workspace,
} from '@mastra/core/workspace';
import { E2BSandbox } from '@mastra/e2b';
import { sandbox as config } from '../config';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
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

export function usedSandbox(requestContext: RequestContext): boolean {
  return reached.has(requestContext);
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
  if (!usedSandbox(requestContext)) {
    return;
  }
  const { threadId } = channelContext(requestContext);
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
export { codeModeToolNames, workspaceToolNames } from './tool-names';

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
  skillSource: new LocalSkillSource({
    basePath:
      [
        resolve(process.cwd(), 'workspace/skills'),
        resolve(process.cwd(), '../../../workspace/skills'),
        resolve(
          dirname(fileURLToPath(import.meta.url)),
          '../../workspace/skills'
        ),
      ].find(existsSync) ?? resolve(process.cwd(), 'workspace/skills'),
  }),
  skills: ['.'],
  tools: {
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
    [WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: {
      name: EDIT_FILE,
      requireReadBeforeWrite: true,
    },
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
