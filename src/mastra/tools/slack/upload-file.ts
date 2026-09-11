import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { resolveTarget, targetSchema } from '../../chat/target';
import { channelContext } from '../../lib/context';
import { input, output } from '../../types/tools/index';
import { requireSandbox } from '../../workspace';
import { assertCanPostTo, joinChannel } from './utils';

const MAX_UPLOAD_BYTES = 100_000_000;

export const uploadFileTool = createTool({
  id: 'upload_file',
  description:
    'Upload a file from the sandbox to Slack. Defaults to the current thread; pass target to send it elsewhere. Channel and thread targets must be in the channel this conversation is already in; user targets must be the requester themselves.',
  inputSchema: input({
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
    target: targetSchema
      .optional()
      .describe('Optional destination other than the current thread.'),
  }),
  outputSchema: output({
    filename: z.string(),
    path: z.string(),
    fileId: z.string().optional(),
  }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: `Uploaded ${output?.filename ?? 'file'}`,
      }),
    },
  },
  execute: async ({ path, filename, comment, target }, context) => {
    if (!context?.requestContext) {
      throw new Error('No workspace context.');
    }
    const sandbox = await requireSandbox(context.requestContext);

    const stat = await sandbox.retryOnDead(() =>
      sandbox.e2b.files.getInfo(path)
    );
    if (stat.size > MAX_UPLOAD_BYTES) {
      throw new Error(
        `${path} is ${Math.round(stat.size / 1_000_000)}MB, over the ${MAX_UPLOAD_BYTES / 1_000_000}MB upload limit.`
      );
    }
    const bytes = await sandbox.retryOnDead(() =>
      sandbox.e2b.files.read(path, { format: 'bytes' })
    );
    const name = filename ?? path.split('/').pop() ?? 'file';

    const ctx = channelContext(context.requestContext);
    const resolved =
      target ??
      (ctx.threadId
        ? { type: 'thread' as const, id: ctx.threadId }
        : undefined);
    if (!resolved) {
      throw new Error('No current thread to upload to.');
    }
    assertCanPostTo({ target: resolved, ctx });
    if (resolved.type !== 'user') {
      await joinChannel(resolved.id);
    }
    const destination = await resolveTarget(resolved);

    const sent = await destination.post({
      markdown: comment ?? '',
      files: [{ data: Buffer.from(bytes), filename: name }],
    });

    const fileId = sent.attachments
      .map((attachment) => /(F[A-Z0-9]{6,})/.exec(attachment.url ?? '')?.[1])
      .find((id) => id !== undefined);

    return {
      filename: name,
      path,
      fileId,
    };
  },
});
