import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import { getSandbox, workspace } from '../workspace';
import { forgetJobs } from '../workspace/jobs';

export const killSandboxTool = createTool({
  id: 'kill_sandbox',
  description:
    "DANGEROUS. Destroy this thread's sandbox and start over with an empty one. Every file in it is lost for good: cloned repos, builds, installed packages, everything. Only use it when the sandbox is unresponsive, meaning commands or file tools keep timing out or hanging even for something trivial like `ls`. Never use it to clean up, free space or fix a failing command. After it, tell the user the sandbox was reset and its files are gone, then redo any setup you still need.",
  inputSchema: z.strictObject({
    reason: z
      .string()
      .min(1)
      .describe('What showed the sandbox is unresponsive.'),
  }),
  outputSchema: z.strictObject({ killed: z.boolean() }),
  transform: {
    display: {
      input: () => ({ summary: 'resetting the sandbox' }),
      output: () => ({ summary: 'sandbox reset' }),
    },
  },
  execute: async ({ reason }, { requestContext }) => {
    const { threadId } = channelContext(requestContext);
    if (!(requestContext && threadId)) {
      throw new Error(
        'No Slack thread bound for this run, so there is no sandbox to kill.'
      );
    }
    const sandbox = await getSandbox(requestContext);
    if (!sandbox) {
      throw new Error('No sandbox available.');
    }
    logger.warn('[sandbox] killing on request', { threadId, reason });
    // Both calls go to E2B's API rather than into the VM, so they work when
    // the VM itself has stopped answering. An attached `destroy()` would list
    // processes inside the VM first and hang.
    if (sandbox.sandboxId) {
      await sandbox.e2b.kill();
    } else {
      await sandbox.destroy();
    }
    workspace.clearSandboxCache(threadId);
    forgetJobs(threadId);
    return { killed: true };
  },
});
