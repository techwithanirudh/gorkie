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

export async function resolveE2BSandbox(
  requestContext: RequestContext
): Promise<E2BSandbox | undefined> {
  const sandbox = await workspace.resolveSandbox({ requestContext });
  return sandbox instanceof E2BSandbox ? sandbox : undefined;
}

export const workspace: Workspace = new Workspace({
  id: 'gorkie-workspace',
  name: 'gorkie',
  sandbox: ({ requestContext }) => {
    const threadId = channelContext(requestContext).threadId;
    if (!threadId) {
      throw new Error('No thread id available for workspace.');
    }
    return createSandbox(threadId);
  },
  filesystem: async ({ requestContext }) => {
    const sandbox = await resolveE2BSandbox(requestContext);
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
    [WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: { name: 'read_file' },
    [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: { name: 'write_file' },
    [WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: { name: 'edit_file' },
    [WORKSPACE_TOOLS.FILESYSTEM.LIST_FILES]: { name: 'list_files' },
    [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: { name: 'delete_file' },
    [WORKSPACE_TOOLS.FILESYSTEM.FILE_STAT]: { name: 'file_stat' },
    [WORKSPACE_TOOLS.FILESYSTEM.MKDIR]: { name: 'mkdir' },
    [WORKSPACE_TOOLS.FILESYSTEM.GREP]: { name: 'grep' },
    [WORKSPACE_TOOLS.FILESYSTEM.AST_EDIT]: { name: 'ast_edit' },
    [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: { name: 'execute_command' },
    [WORKSPACE_TOOLS.SANDBOX.GET_PROCESS_OUTPUT]: {
      name: 'get_process_output',
    },
    [WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS]: { name: 'kill_process' },
  },
});
