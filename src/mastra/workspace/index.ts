import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
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

function getThreadId(
  requestContext: Parameters<typeof channelContext>[0]
): string {
  const threadId = channelContext(requestContext).threadId;
  if (!threadId) {
    throw new Error('No thread id available for workspace.');
  }
  return threadId;
}

export const workspace: Workspace = new Workspace({
  id: 'gorkie-workspace',
  name: 'gorkie',
  sandbox: ({ requestContext }) => createSandbox(getThreadId(requestContext)),
  filesystem: async ({ requestContext }) => {
    const sandbox = await workspace.resolveSandbox({ requestContext });
    if (!(sandbox instanceof E2BSandbox)) {
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
    basePath: existsSync(resolve(process.cwd(), 'workspace/skills'))
      ? resolve(process.cwd(), 'workspace/skills')
      : resolve(process.cwd(), '../../../workspace/skills'),
  }),
  skills: ['.'],
  tools: {
    // TODO: Fix sandbox image viewing via file reads. Mastra read_file media currently
    // sends base64 tool results through a bugged multimodal path, so workspace media
    [WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: {
      name: 'read_file',
      mediaTypes: false,
    },
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
