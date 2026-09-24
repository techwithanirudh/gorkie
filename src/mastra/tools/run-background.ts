import type { BackgroundTask } from '@mastra/core/background-tasks';
import { RequestContext } from '@mastra/core/request-context';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../chat/client';
import { getMastra } from '../chat/mastra-instance';
import { claimTurn } from '../chat/usage';
import { agent as agentConfig, sandbox as sandboxConfig } from '../config';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import type { ChannelContext, ThreadOnlyChannelContext } from '../types';
import { requireSandbox } from '../workspace';
import { startJob } from '../workspace/jobs';

// The completion callback gets only the task record, whose `threadId` is the
// memory thread. The woken run needs the Slack channel context the way `wait`
// carries it, so the job hands it over by task id. In memory: a restart loses
// the job itself too.
const wakeChannels = new Map<string, ChannelContext>();

function threadOnlyChannel({
  taskId,
  threadId,
}: {
  taskId: string;
  threadId: string;
}): ThreadOnlyChannelContext | undefined {
  try {
    return {
      platform: 'slack',
      threadId,
      channelId: slack.channelIdFromThreadId(threadId),
      isDM: slack.isDM(threadId),
    };
  } catch (error) {
    logger.warn('[run_background] no Slack thread to wake', {
      error,
      taskId,
      threadId,
    });
  }
}

async function wakeThread(task: BackgroundTask): Promise<void> {
  const saved = wakeChannels.get(task.id);
  wakeChannels.delete(task.id);
  const { threadId, resourceId } = task;
  if (!(threadId && resourceId)) {
    return;
  }
  const channel = saved ?? threadOnlyChannel({ taskId: task.id, threadId });
  if (!channel) {
    return;
  }
  if (
    channel.userId &&
    (await claimTurn(channel.userId)).status === 'over-limit'
  ) {
    logger.info('[run_background] wake skipped, over the turn limit', {
      taskId: task.id,
    });
    return;
  }
  const outcome =
    task.status === 'completed'
      ? 'finished'
      : `did not finish (${task.status}${task.error ? `: ${task.error.message}` : ''})`;
  const reason = z.object({ reason: z.string() }).safeParse(task.args)
    .data?.reason;
  try {
    // Channels never passes `untilIdle`, so a finished task would only land in
    // memory. The same idle wake `wait` uses turns it into a reply.
    const { accepted } = getMastra()
      .getAgentById(agentConfig.id)
      .sendSignal(
        {
          type: 'notification',
          contents: `Your background job${reason ? ` (${reason})` : ''} ${outcome}. Its result is in the run_background tool output. Report it to the person in this thread.`,
        },
        {
          threadId,
          resourceId,
          ifIdle: {
            behavior: 'wake',
            streamOptions: {
              requestContext: new RequestContext([['channel', channel]]),
            },
          },
        }
      );
    await accepted;
  } catch (error) {
    logger.error('[run_background] failed to wake the thread', {
      error,
      taskId: task.id,
      threadId: task.threadId,
    });
  }
}

export const runBackgroundTool = createTool({
  id: 'run_background',
  description:
    "Run a long shell command in this thread's sandbox without holding up the conversation. It returns immediately and keeps running after your turn ends; when it finishes you are woken in this thread with the exit code and output, and you report back then. Use it for builds, long installs, test suites, or anything over a few minutes; use execute_command for quick commands. Say what you are starting before you call it.",
  inputSchema: z.strictObject({
    command: z.string().min(1).describe('Shell command to run in the sandbox.'),
    timeout: z
      .number()
      .int()
      .min(1)
      .max(sandboxConfig.background.maxTimeoutSeconds)
      .describe(
        `Seconds before the command is killed, at most ${sandboxConfig.background.maxTimeoutSeconds}.`
      ),
    reason: z
      .string()
      .min(1)
      .describe('What it runs and why, shown while it works.'),
  }),
  outputSchema: z.strictObject({
    exitCode: z.number(),
    timedOut: z.boolean(),
    stdout: z.string(),
    stderr: z.string(),
  }),
  background: {
    enabled: true,
    timeoutMs:
      (sandboxConfig.background.maxTimeoutSeconds +
        sandboxConfig.background.taskTimeoutBufferSeconds) *
      1000,
    onComplete: wakeThread,
    onFailed: wakeThread,
  },
  transform: {
    display: {
      output: ({ input }) => ({
        summary: `Background job: ${input?.reason ?? 'command'}`,
      }),
    },
  },
  execute: async ({ command, timeout }, context) => {
    const { requestContext } = context;
    const channel = channelContext(requestContext);
    const id = context.background?.taskId ?? context.agent?.toolCallId;
    if (!(id && channel.threadId)) {
      throw new Error('No Slack thread bound for this run.');
    }
    if (context.background) {
      wakeChannels.set(context.background.taskId, channel);
    }
    const job = startJob({
      id,
      threadId: channel.threadId,
      timeoutMs: timeout * 1000,
    });
    try {
      const sandbox = await requireSandbox(requestContext);
      job.attachSandbox(sandbox);
      const deadline = AbortSignal.timeout(timeout * 1000);
      const handle = await sandbox.processes.spawn(command, {
        cwd: sandboxConfig.workdir,
        stdinMode: 'ignore',
        timeout:
          (timeout + sandboxConfig.background.spawnBackstopSeconds) * 1000,
      });
      job.attachPid(handle.pid);
      const result = await handle.wait({
        abortSignal: context.abortSignal
          ? AbortSignal.any([deadline, context.abortSignal])
          : deadline,
      });
      return {
        exitCode: result.exitCode,
        timedOut: deadline.aborted,
        stdout: result.stdout.slice(-sandboxConfig.background.outputTailChars),
        stderr: result.stderr.slice(-sandboxConfig.background.outputTailChars),
      };
    } finally {
      job.end();
      // A cancelled task gets no completion callback to clear this.
      if (context.abortSignal?.aborted) {
        wakeChannels.delete(id);
      }
    }
  },
});
