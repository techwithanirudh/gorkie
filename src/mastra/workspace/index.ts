import { join, posix } from 'node:path';
import { RequestContext } from '@mastra/core/request-context';
import {
  LocalSkillSource,
  WORKSPACE_TOOLS,
  Workspace,
  type WorkspaceToolAfterHookContext,
  type WorkspaceToolBeforeHookResult,
  type WorkspaceToolHookContext,
} from '@mastra/core/workspace';
import { E2BSandbox } from '@mastra/e2b';
import { z } from 'zod';
import { env } from '@/env';
import { sandbox as config } from '../config';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import { SandboxBrowser } from './browser';
import { E2BFilesystem } from './filesystem';
import { findJob, hasLiveJob, startJob } from './jobs';
import { createSandbox } from './sandbox';
import {
  DELETE_FILE,
  EDIT_FILE,
  EXECUTE_COMMAND,
  FILE_STAT,
  GREP,
  LIST_FILES,
  READ_FILE,
  WRITE_FILE,
} from './tool-names';

const reached = new WeakSet<RequestContext>();
const extendedAt = new WeakMap<E2BSandbox, number>();
const unscopedSandboxKey = '__unscoped__';

const toolCallContext = z.object({
  agent: z.object({ toolCallId: z.string() }).optional(),
  requestContext: z.instanceof(RequestContext),
});
const backgroundCommand = z.looseObject({ background: z.literal(true) });
const backgroundTimeout = backgroundCommand.extend({
  timeout: z.coerce
    .number()
    .positive()
    .max(config.background.maxTimeoutSeconds),
});

function sandboxKey(requestContext: RequestContext): string {
  return channelContext(requestContext).threadId || unscopedSandboxKey;
}

// A sandbox not attached yet gets the full timeout when it connects, so only
// an attached one needs pushing out. Every workspace tool call lands here, so
// a deadline pushed in the last two minutes is left alone rather than paying
// an E2B round trip per call.
async function extendSandbox(sandbox: E2BSandbox): Promise<void> {
  if (!sandbox.sandboxId) {
    return;
  }
  const last = extendedAt.get(sandbox);
  if (last !== undefined && Date.now() - last < config.timeout / 8) {
    return;
  }
  try {
    await sandbox.retryOnDead(() => sandbox.e2b.setTimeout(config.timeout));
    extendedAt.set(sandbox, Date.now());
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

export async function writeSandboxFile({
  data,
  path,
  sandbox,
}: {
  data: string | ArrayBuffer;
  path: string;
  sandbox: E2BSandbox;
}): Promise<void> {
  await sandbox.retryOnDead(async () => {
    await sandbox.e2b.files.makeDir(posix.dirname(path));
    await sandbox.e2b.files.write(path, data);
  });
}

export function sandboxPath(...parts: string[]): string {
  return posix.join(config.workdir, ...parts);
}

async function getSandbox(
  requestContext: RequestContext
): Promise<E2BSandbox | undefined> {
  const sandbox = await workspace.resolveSandbox({ requestContext });
  if (!(sandbox instanceof E2BSandbox)) {
    return;
  }
  reached.add(requestContext);
  return sandbox;
}

// The output phase never runs on an abort or a thrown turn, so the
// orchestrator's `onAbort`/`onError` call this too.
export async function endSandboxTurn(
  requestContext: RequestContext
): Promise<void> {
  const { threadId } = channelContext(requestContext);
  if (threadId) {
    await browser.closeThreadSession(threadId);
  }
  if (!reached.has(requestContext)) {
    return;
  }
  // An E2B pause freezes a running background job.
  if (threadId && hasLiveJob(threadId)) {
    return;
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

async function beforeToolCall({
  context,
  input,
  workspaceToolName,
}: WorkspaceToolHookContext): Promise<
  WorkspaceToolBeforeHookResult | undefined
> {
  const call = toolCallContext.safeParse(context).data;
  // Every run without a thread would share the one unscoped sandbox, and with
  // it the files and processes of whoever ran there before.
  if (!call || sandboxKey(call.requestContext) === unscopedSandboxKey) {
    return {
      proceed: false,
      output:
        'No Slack thread bound for this run, so a sandbox tool cannot run here.',
    };
  }
  const background =
    workspaceToolName === WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND &&
    backgroundCommand.safeParse(input).success;
  const timeout = background
    ? backgroundTimeout.safeParse(input).data?.timeout
    : undefined;
  if (background && timeout === undefined) {
    return {
      proceed: false,
      output: `A background command needs a \`timeout\` in seconds, at most ${config.background.maxTimeoutSeconds}. Run it again with one.`,
    };
  }
  const sandbox = await getSandbox(call.requestContext);
  if (!sandbox) {
    return;
  }
  await extendSandbox(sandbox);
  const { threadId } = channelContext(call.requestContext);
  if (timeout !== undefined && threadId && call.agent) {
    startJob({
      id: call.agent.toolCallId,
      threadId,
      sandbox,
      timeoutMs: timeout * 1000,
    });
  }
}

function afterToolCall({
  context,
  error,
  input,
  output,
}: WorkspaceToolAfterHookContext): void {
  const toolCallId = toolCallContext.safeParse(context).data?.agent?.toolCallId;
  if (!toolCallId) {
    return;
  }
  if (error !== undefined) {
    findJob(toolCallId)?.end();
    return;
  }
  // execute_command reports a background spawn only as this sentence,
  // and !stop needs the pid to kill the process.
  const pid =
    backgroundCommand.safeParse(input).success && typeof output === 'string'
      ? output.match(/\(PID: ([^)\s]+)\)/)?.[1]
      : undefined;
  if (pid) {
    findJob(toolCallId)?.attachPid(pid);
  }
}

export { codeModeToolNames } from './tool-names';

export const browser = new SandboxBrowser({
  sandboxFor: (threadId) =>
    requireSandbox(new RequestContext([['channel', { threadId }]])),
});

export const workspace: Workspace = new Workspace({
  id: 'main-workspace',
  name: 'Workspace',
  sandbox: ({ requestContext }) => {
    // Mastra can resolve workspace instructions before a thread is bound, and
    // a throw here fails the turn on every fallback model.
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
    hooks: {
      beforeToolCall,
      afterToolCall,
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
      backgroundProcesses: {
        abortSignal: false,
        onExit: ({ toolCallId }) => {
          if (toolCallId) {
            findJob(toolCallId)?.end();
          }
        },
      },
    },
    [WORKSPACE_TOOLS.SANDBOX.GET_PROCESS_OUTPUT]: {
      name: 'get_process_output',
    },
    [WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS]: { name: 'kill_process' },
    [WORKSPACE_TOOLS.LSP.LSP_INSPECT]: { enabled: false },
  },
});
