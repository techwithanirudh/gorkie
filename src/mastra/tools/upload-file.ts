import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { uploadSlackFiles } from '@chat-adapter/slack/api';
import type { E2BSandbox } from '@mastra/e2b';
import { slack } from '../channels/slack';
import { env } from '../../env';
import { rawId } from './slack-context';
import { channelContext } from '../types';

export const uploadFileTool = createTool({
  id: 'upload_file',
  description:
    'Upload a file from the sandbox to the current Slack thread. Use when asked to share, show, or send a file you created or inspected.',
  inputSchema: z.object({
    path: z
      .string()
      .min(1)
      .describe('Path to the file in the sandbox (relative to the working dir).'),
    filename: z.string().optional().describe('Optional filename shown in Slack.'),
    title: z.string().optional(),
    comment: z
      .string()
      .optional()
      .describe('Optional message to post alongside the file.'),
  }),
  execute: async ({ path, filename, title, comment }, context) => {
    if (!context?.workspace || !context.requestContext) {
      throw new Error('No workspace context.');
    }
    const sandbox = (await context.workspace.resolveSandbox({
      requestContext: context.requestContext,
    })) as E2BSandbox | undefined;
    if (!sandbox) throw new Error('No sandbox available.');
    await sandbox.start();

    const bytes = await sandbox.e2b.files.read(path, { format: 'bytes' });
    const name = filename ?? path.split('/').pop() ?? 'file';

    const ctx = channelContext(context.requestContext);
    const decoded = ctx.threadId ? slack.decodeThreadId(ctx.threadId) : undefined;
    const channelId = decoded?.channel ?? (ctx.channelId ? rawId(ctx.channelId) : undefined);
    if (!channelId) throw new Error('No channel to upload to.');

    await uploadSlackFiles([{ data: bytes, filename: name, title }], {
      token: env.SLACK_BOT_TOKEN,
      channelId,
      threadTs: decoded?.threadTs,
      initialComment: comment,
    });

    return { filename: name, path, summary: `Uploaded ${name} to this Slack thread.` };
  },
});
