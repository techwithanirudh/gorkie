import type { RequestContext } from '@mastra/core/request-context';
import type { ToolExecutionContext } from '@mastra/core/tools';
import {
  createWorkspaceTools,
  type ProcessHandle,
} from '@mastra/core/workspace';
import { z } from 'zod';
import { sandbox as config } from '../config';
import { channelContext } from '../lib/context';
import { describeWorkSchema } from '../tools/work-description';
import { getSandbox, workspace } from './index';
import { runningJobs, trackJob } from './jobs';
import { EXECUTE_COMMAND } from './tool-names';

type WorkspaceTools = Awaited<ReturnType<typeof createWorkspaceTools>>;
type ExecuteCommand = (
  input: unknown,
  context: ToolExecutionContext
) => Promise<unknown>;

const commandInput = z.looseObject({
  background: z.boolean().nullish(),
  tail: z.number().int().nullish(),
  timeout: z.number().nullish(),
});

function commandOutput({
  handle,
  tail,
}: {
  handle: ProcessHandle;
  tail: number;
}): string {
  const lines = [handle.stdout, handle.stderr]
    .filter(Boolean)
    .join('\n')
    .split('\n');
  return (tail > 0 ? lines.slice(-tail) : lines).join('\n').trim();
}

// Mastra can background a command but never does so by itself, so a hung
// foreground command would block the turn until its timeout. Every command is
// spawned as a process here, and one that outlasts the wait hands back its pid.
function runWithAutoBackground(execute: ExecuteCommand): ExecuteCommand {
  return async (input, context) => {
    const { requestContext } = context;
    const threadId = requestContext
      ? channelContext(requestContext).threadId
      : undefined;
    if (runningJobs(threadId) >= config.maxJobs) {
      throw new Error(
        `This thread already has ${config.maxJobs} commands running. Check them with get_process_output or stop one with kill_process first.`
      );
    }
    const parsed = commandInput.parse(input);
    const started = await execute(
      {
        ...commandInput.parse(input),
        background: true,
        timeout: parsed.timeout ?? config.executionTimeout / 1000,
      },
      context
    );
    const pid = /PID: ([^)]+)\)/.exec(String(started))?.[1];
    const sandbox = requestContext
      ? await getSandbox(requestContext)
      : undefined;
    const handle = pid ? await sandbox?.processes?.get(pid) : undefined;
    if (!(handle && threadId)) {
      return started;
    }
    trackJob({ handle, threadId });
    if (parsed.background) {
      return started;
    }
    const finished = await new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => resolve(false), config.autoBackgroundMs);
      const abort = () => {
        clearTimeout(timer);
        handle.kill().catch(() => undefined);
        reject(new Error('The command was stopped.'));
      };
      context.abortSignal?.addEventListener('abort', abort, { once: true });
      handle.wait().then(
        () => {
          clearTimeout(timer);
          context.abortSignal?.removeEventListener('abort', abort);
          resolve(true);
        },
        () => {
          clearTimeout(timer);
          resolve(true);
        }
      );
    });
    const output = commandOutput({ handle, tail: parsed.tail ?? 200 });
    if (finished) {
      return handle.exitCode
        ? `${output}\n\nExit code: ${handle.exitCode}`.trim()
        : output || '(no output)';
    }
    return `Still running after ${config.autoBackgroundMs / 60_000} minutes, so it moved to the background (PID: ${pid}). Check it with get_process_output or stop it with kill_process. Output so far:\n${commandOutput({ handle, tail: 30 })}`;
  };
}

async function describedTools(requestContext?: RequestContext) {
  const tools = await createWorkspaceTools(workspace, {
    workspace,
    requestContext,
  });
  const command = tools[EXECUTE_COMMAND];
  if (command) {
    command.inputSchema = describeWorkSchema(command.inputSchema);
    if (command.execute) {
      command.execute = runWithAutoBackground(command.execute);
    }
  }
  return tools;
}

const byRequest = new WeakMap<RequestContext, Promise<WorkspaceTools>>();

export function workspaceTools(
  requestContext?: RequestContext
): Promise<WorkspaceTools> {
  if (!requestContext) {
    return describedTools();
  }
  const cached = byRequest.get(requestContext);
  if (cached) {
    return cached;
  }
  const created = describedTools(requestContext);
  byRequest.set(requestContext, created);
  return created;
}
