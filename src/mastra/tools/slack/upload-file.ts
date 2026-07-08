import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { withAttribution } from '../../chat/attribution';
import { resolveTarget, targetSchema } from '../../chat/target';
import { channelContext } from '../../lib/context';
import { rawId } from '../../lib/ids';
import { resolveE2BSandbox } from '../../workspace';
import { assertCanPostTo } from './utils';

export const uploadFileTool = createTool({
  id: 'upload_file',
  description:
    'Upload a file from the sandbox to a Slack destination. Defaults to the current thread; pass target to send it elsewhere. A footer crediting the requesting user is appended automatically, so do NOT add your own attribution.',
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
    target: targetSchema
      .optional()
      .describe('Optional destination other than the current thread.'),
  }),
  execute: async ({ path, filename, comment, target }, context) => {
    if (!context?.requestContext) {
      throw new Error('No workspace context.');
    }
    const sandbox = await resolveE2BSandbox(context.requestContext);
    if (!sandbox) {
      throw new Error('No sandbox available.');
    }
    await sandbox.ensureRunning();

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
    const isCurrentThread =
      resolved.type === 'thread' && resolved.id === ctx.threadId;
    const isSelfDm =
      resolved.type === 'user' &&
      !!ctx.userId &&
      rawId(resolved.id) === rawId(ctx.userId);
    const markdown = withAttribution({
      message: comment ?? '',
      userId: ctx.userId,
      skipAttribution: isCurrentThread || isSelfDm,
    });

    const destination = await resolveTarget(resolved);

    await destination.post({
      markdown,
      files: [{ data: Buffer.from(bytes), filename: name }],
    });

    return {
      success: true,
      filename: name,
      path,
      message: target
        ? `Uploaded ${name} to ${resolved.type} ${resolved.id}.`
        : `Uploaded ${name} to this Slack thread.`,
    };
  },
});
