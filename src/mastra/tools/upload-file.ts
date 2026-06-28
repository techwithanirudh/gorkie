import { createTool } from '@mastra/core/tools';
import type { E2BSandbox } from '@mastra/e2b';
import { z } from 'zod';
import { chat } from '../chat/instance';
import { channelContext } from '../lib/context';

export const uploadFileTool = createTool({
  id: 'upload_file',
  description:
    'Upload a file from the sandbox to the current Slack thread. Use when asked to share, show, or send a file you created or inspected.',
  inputSchema: z.object({
    path: z
      .string()
      .min(1)
      .describe(
        'Path to the file in the sandbox (relative to the working dir).'
      ),
    filename: z
      .string()
      .optional()
      .describe('Optional filename shown in Slack.'),
    comment: z
      .string()
      .optional()
      .describe('Optional message to post alongside the file.'),
  }),
  execute: async ({ path, filename, comment }, context) => {
    if (!(context?.workspace && context.requestContext)) {
      throw new Error('No workspace context.');
    }
    const sandbox = (await context.workspace.resolveSandbox({
      requestContext: context.requestContext,
    })) as E2BSandbox | undefined;
    if (!sandbox) {
      throw new Error('No sandbox available.');
    }
    await sandbox.start();

    const bytes = await sandbox.e2b.files.read(path, { format: 'bytes' });
    const name = filename ?? path.split('/').pop() ?? 'file';

    const threadId = channelContext(context.requestContext).threadId;
    if (!threadId) {
      throw new Error('No current thread to upload to.');
    }

    await chat()
      .thread(threadId)
      .post({
        markdown: comment ?? '',
        files: [{ data: Buffer.from(bytes), filename: name }],
      });

    return {
      success: true,
      filename: name,
      path,
      message: `Uploaded ${name} to this Slack thread.`,
    };
  },
});
