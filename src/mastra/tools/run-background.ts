import type { BackgroundTask } from '@mastra/core/background-tasks';
import { RequestContext } from '@mastra/core/request-context';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getMastra } from '../chat/mastra-instance';
import { agent as agentConfig, sandbox as sandboxConfig } from '../config';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import type { ChannelContext } from '../types';
import { requireSandbox } from '../workspace';
import { attachPid, endJob, startJob } from '../workspace/jobs';

// The completion callback gets only the task record, whose `threadId` is the
// memory thread. The woken run needs the Slack channel context the way `wait`
// carries it, so the job hands it over by task id. A restart loses the job
// itself too, so memory is enough.
const wakeChannels = new Map<string, ChannelContext>();

async function wakeThread(task: BackgroundTask): Promise<void> {
  const channel = wakeChannels.get(task.id) ?? { threadId: task.threadId };
  wakeChannels.delete(task.id);
  if (!(task.threadId && task.resourceId)) {
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
          threadId: task.threadId,
          resourceId: task.resourceId,
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
    // Past the command's own cap, so the command's timeout is what reports.
    timeoutMs: (sandboxConfig.background.maxTimeoutSeconds + 120) * 1000,
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
    if (!requestContext) {
      throw new Error('No Slack thread bound for this run.');
    }
    const channel = channelContext(requestContext);
    const id = context.background?.taskId ?? context.agent?.toolCallId;
    if (!(id && channel.threadId)) {
      throw new Error('No Slack thread bound for this run.');
    }
    if (context.background) {
      wakeChannels.set(context.background.taskId, channel);
    }
    const sandbox = await requireSandbox(requestContext);
    const deadline = AbortSignal.timeout(timeout * 1000);
    startJob({
      id,
      threadId: channel.threadId,
      sandbox,
      timeoutMs: timeout * 1000,
    });
    try {
      const handle = await sandbox.processes.spawn(command, {
        cwd: sandboxConfig.workdir,
        stdinMode: 'ignore',
        // E2B's own deadline is only a backstop behind the wait below.
        timeout: (timeout + 60) * 1000,
      });
      attachPid({ id, pid: handle.pid });
      const result = await handle.wait({
        abortSignal: context.abortSignal
          ? AbortSignal.any([deadline, context.abortSignal])
          : deadline,
      });
      return {
        exitCode: result.exitCode,
        timedOut: deadline.aborted,
        stdout: result.stdout.slice(-10_000),
        stderr: result.stderr.slice(-10_000),
      };
    } finally {
      endJob(id);
      // A cancelled task gets no completion callback to clear this.
      if (context.abortSignal?.aborted) {
        wakeChannels.delete(id);
      }
    }
  },
});
