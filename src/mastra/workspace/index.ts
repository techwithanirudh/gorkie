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
import { E2BFilesystem } from './filesystem';
import { createSandbox } from './sandbox';
import {
  DELETE_FILE,
  EDIT_FILE,
  EXECUTE_COMMAND,
  FILE_STAT,
  GET_PROCESS_OUTPUT,
  KILL_PROCESS,
  LIST_FILES,
  READ_FILE,
  WRITE_FILE,
} from './tool-names';

export async function getSandbox(
  requestContext: RequestContext
): Promise<E2BSandbox | undefined> {
  const sandbox = await workspace.resolveSandbox({ requestContext });
  return sandbox instanceof E2BSandbox ? sandbox : undefined;
}

export { sandboxPath } from './path';
export { codeModeToolNames, workspaceToolNames } from './tool-names';

export const workspace: Workspace = new Workspace({
  id: 'main-workspace',
  name: 'Workspace',
  sandbox: ({ requestContext }) => {
    const { threadId } = channelContext(requestContext);
    if (!threadId) {
      throw new Error('No thread id available for workspace.');
    }
    return createSandbox(threadId);
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
    channelContext(requestContext).threadId,
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
    [WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: { name: READ_FILE },
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
    // The network-bound built-in grep hangs on large trees; use the ripgrep tool instead.
    [WORKSPACE_TOOLS.FILESYSTEM.GREP]: { enabled: false },
    [WORKSPACE_TOOLS.FILESYSTEM.AST_EDIT]: { enabled: false },
    [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: { name: EXECUTE_COMMAND },
    [WORKSPACE_TOOLS.SANDBOX.GET_PROCESS_OUTPUT]: {
      name: GET_PROCESS_OUTPUT,
    },
    [WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS]: { name: KILL_PROCESS },
    // Registered unconditionally by createWorkspaceTools even though no LSP is
    // configured here, so it would offer the model a tool that cannot work.
    [WORKSPACE_TOOLS.LSP.LSP_INSPECT]: { enabled: false },
  },
});
