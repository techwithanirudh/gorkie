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

export function usedSandbox(requestContext: RequestContext): boolean {
  return reached.has(requestContext);
}

export async function requireSandbox(
  requestContext: RequestContext
): Promise<E2BSandbox> {
  // Without a thread the `sandbox` resolver hands back the shared
  // `__unscoped__` scratch sandbox, which a tool must never run commands in.
  if (!channelContext(requestContext).threadId) {
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

// Mastra skips the `sandbox` output processor on an aborted or thrown turn, so
// `onAbort`/`onError` call this too, or the sandbox stays live until its own
// timeout.
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
    const { threadId } = channelContext(requestContext);
    // Mastra can resolve workspace instructions before a thread is bound, and
    // a scheduled or idle wake may arrive without channel context. Throwing
    // here fails the turn on every fallback model.
    return createSandbox(threadId ?? '__unscoped__');
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
  sandboxCacheKey: ({ requestContext }) =>
    channelContext(requestContext).threadId ?? '__unscoped__',
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
      // read_file types media by extension, so a mislabeled file becomes a bad
      // image part. Images go through view_image, which types by bytes.
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
      // Mastra defaults this to the agent's abort signal, which kills every
      // `background: true` process when the turn ends.
      backgroundProcesses: { abortSignal: false },
      requireDescription: true,
    },
    [WORKSPACE_TOOLS.SANDBOX.GET_PROCESS_OUTPUT]: {
      name: GET_PROCESS_OUTPUT,
    },
    [WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS]: { name: KILL_PROCESS },
    [WORKSPACE_TOOLS.LSP.LSP_INSPECT]: { enabled: false },
  },
});
