import { setTimeout as delay } from 'node:timers/promises';
import type { RequestContext } from '@mastra/core/request-context';
import type { ToolExecutionContext } from '@mastra/core/tools';
import { createWorkspaceTools } from '@mastra/core/workspace';
import { z } from 'zod';
import { sandbox as config } from '../config';
import { channelContext } from '../lib/context';
import { describeWorkSchema } from '../tools/work-description';
import { requireSandbox, workspace } from './index';
import { runningJobs, trackJob } from './jobs';
import { EXECUTE_COMMAND, GET_PROCESS_OUTPUT } from './tool-names';

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

// Mastra can background a command but never does so by itself, so a hung
// foreground command would block the turn until its timeout. Every command is
// spawned as a process here, and one that outlasts the wait hands back its pid.
function runWithAutoBackground({
  execute,
  readOutput,
}: {
  execute: ExecuteCommand;
  readOutput: ExecuteCommand;
}): ExecuteCommand {
  return async (input, context) => {
    const { requestContext } = context;
    if (!requestContext) {
      throw new Error('Commands need a live thread.');
    }
    const { threadId } = channelContext(requestContext);
    if (runningJobs(threadId) >= config.maxJobs) {
      throw new Error(
        `This thread already has ${config.maxJobs} commands running. Check them with get_process_output or stop one with kill_process first.`
      );
    }
    const sandbox = await requireSandbox(requestContext);
    const parsed = commandInput.parse(input);
    const started = await execute(
      {
        ...parsed,
        background: true,
        timeout: parsed.timeout ?? config.executionTimeout / 1000,
      },
      context
    );
    const pid = /PID: ([^)]+)\)/.exec(String(started))?.[1];
    const handle = pid ? await sandbox.processes?.get(pid) : undefined;
    if (!(handle && threadId)) {
      throw new Error('The command started but could not be tracked.');
    }
    trackJob({ handle, threadId });
    if (parsed.background) {
      return started;
    }
    const finished = await Promise.race([
      handle.wait({ abortSignal: context.abortSignal }).then(
        () => true,
        () => true
      ),
      delay(config.autoBackgroundMs, false, { ref: false }),
    ]);
    if (context.abortSignal?.aborted) {
      throw new Error('The command was stopped.');
    }
    if (finished) {
      return await readOutput(
        { pid, tail: parsed.tail ?? 200, wait: true },
        context
      );
    }
    const soFar = await readOutput({ pid, tail: 30 }, context);
    return `Still running after ${config.autoBackgroundMs / 60_000} minutes, so it moved to the background (PID: ${pid}). Check it with get_process_output or stop it with kill_process. Output so far:\n${soFar}`;
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
    const readOutput = tools[GET_PROCESS_OUTPUT]?.execute;
    if (command.execute && readOutput) {
      command.execute = runWithAutoBackground({
        execute: command.execute,
        readOutput,
      });
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
