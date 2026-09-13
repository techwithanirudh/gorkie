import { createTool } from '@mastra/core/tools';
import { CommandExitError } from 'e2b';
import { z } from 'zod';
import { sandbox as sandboxConfig } from '../config';
import { rememberThreadChannel } from '../lib/background-tasks';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import { input, output } from '../types/tools/index';
import { requireSandbox } from '../workspace';

const KEEPALIVE_INTERVAL_MS = 10 * 60 * 1000;
const MAX_OUTPUT_CHARS = 10_000;

function tail(text: string): string {
  return text.length > MAX_OUTPUT_CHARS ? text.slice(-MAX_OUTPUT_CHARS) : text;
}

export const runBackgroundTool = createTool({
  id: 'run_background',
  description:
    "Run a long shell command in this thread's sandbox in the background. It returns immediately and keeps running after your turn ends; you are messaged in this thread when it finishes, with the exit code and output. Use it for builds, long installs, or jobs over a few minutes; use execute_command for quick commands. Post a short message saying what you are starting before you call this.",
  inputSchema: input({
    command: z.string().min(1).describe('Shell command to run in the sandbox.'),
    reason: z
      .string()
      .min(1)
      .describe('What it runs and why, shown while it works.'),
  }),
  outputSchema: output({
    exitCode: z.number(),
    stdout: z.string(),
    stderr: z.string(),
  }),
  transform: {
    display: {
      output: ({ input: inputData }) => ({
        summary: `Background job: ${inputData?.reason ?? 'command'}`,
      }),
    },
  },
  execute: async ({ command }, context) => {
    if (!context?.requestContext) {
      throw new Error('No workspace context.');
    }
    // This runs off-turn, so the completion callback has no channel context of
    // its own to wake the thread with. Hand it this turn's.
    rememberThreadChannel({
      channel: channelContext(context.requestContext),
      memoryThreadId: context.agent?.threadId,
    });
    const sandbox = await requireSandbox(context.requestContext);
    // The turn that started this pauses the sandbox at its end; the pauseSandbox
    // guard keeps the box for a live task, and this refresh stops E2B's own
    // timeout from reaping it partway through a long run.
    const keepAlive = setInterval(() => {
      sandbox
        .retryOnDead(() => sandbox.e2b.setTimeout(sandboxConfig.timeout))
        .catch((error: unknown) =>
          logger.debug('[run_background] keepalive failed', { error })
        );
    }, KEEPALIVE_INTERVAL_MS);
    try {
      const result = await sandbox.retryOnDead(() =>
        sandbox.e2b.commands.run(command, {
          timeoutMs: sandboxConfig.backgroundTimeout,
        })
      );
      return {
        exitCode: result.exitCode,
        stdout: tail(result.stdout),
        stderr: tail(result.stderr),
      };
    } catch (error) {
      if (error instanceof CommandExitError) {
        return {
          exitCode: error.exitCode,
          stdout: tail(error.stdout),
          stderr: tail(error.stderr),
        };
      }
      throw error;
    } finally {
      clearInterval(keepAlive);
    }
  },
});
