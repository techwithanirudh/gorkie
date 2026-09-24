import { posix } from 'node:path';
import type { RequestContext } from '@mastra/core/request-context';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { upload } from '../../config';
import { channelContext } from '../../lib/context';
import { type Target, targetSchema } from '../../types/tools/index';
import { requireSandbox } from '../../workspace';
import { confinePath } from '../../workspace/filesystem';
import { assertCanPostTo, slackDestination } from './utils';

async function uploadToSlack({
  comment,
  filename,
  path,
  requestContext,
  target,
}: {
  comment?: string;
  filename?: string;
  path: string;
  requestContext: RequestContext;
  target?: Target;
}) {
  const filePath = confinePath({ inputPath: path });
  const sandbox = await requireSandbox(requestContext);

  const stat = await sandbox.retryOnDead(() =>
    sandbox.e2b.files.getInfo(filePath)
  );
  if (stat.size > upload.maxBytes) {
    throw new Error(
      `${path} is ${Math.round(stat.size / 1_000_000)}MB, over the ${upload.maxBytes / 1_000_000}MB upload limit.`
    );
  }
  const name = filename ?? (posix.basename(path) || 'file');

  const ctx = channelContext(requestContext);
  const resolved =
    target ??
    (ctx.threadId ? { type: 'thread' as const, id: ctx.threadId } : undefined);
  if (!resolved) {
    throw new Error('No current thread to upload to.');
  }
  assertCanPostTo({ target: resolved, ctx });
  const destination = await slackDestination(resolved);

  const created = await slack.webClient.files.getUploadURLExternal({
    filename: name,
    length: stat.size,
  });
  if (!(created.upload_url && created.file_id)) {
    throw new Error('Slack did not return an upload URL.');
  }
  const source = await sandbox.retryOnDead(() =>
    // The read is drained at whatever rate Slack accepts bytes, and the idle
    // window defaults to the 60s request timeout, so a large file over a
    // slow link trips it partway through. 0 disables it.
    sandbox.e2b.files.read(filePath, {
      format: 'stream',
      streamIdleTimeoutMs: 0,
    })
  );
  let uploaded = 0;
  const body = source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        uploaded += chunk.byteLength;
        controller.enqueue(chunk);
      },
    })
  );
  // `duplex: 'half'` is mandatory for a stream body on Node's undici and is
  // missing from the DOM `RequestInit` type.
  const streamed: RequestInit & { duplex: 'half' } = {
    body,
    duplex: 'half',
    method: 'POST',
  };
  const sent = await fetch(created.upload_url, streamed);
  if (!sent.ok) {
    throw new Error(`Upload to Slack failed with ${sent.status}.`);
  }
  // A reclaimed E2B stream ends cleanly and Slack accepts a short body, so truncation is silent.
  if (uploaded !== stat.size) {
    throw new Error(
      `${path} was truncated in transit: sent ${uploaded} of ${stat.size} bytes. Nothing was posted to Slack, try the upload again.`
    );
  }
  await slack.webClient.files.completeUploadExternal({
    channel_id: destination.channel,
    files: [{ id: created.file_id, title: name }],
    initial_comment: comment,
    thread_ts: destination.threadTs,
  });

  return {
    filename: name,
    path,
    fileId: created.file_id,
  };
}

export const uploadFileTool = createTool({
  id: 'upload_file',
  description:
    'Upload a file from the sandbox to Slack. Defaults to the current thread; pass target to send it elsewhere. Channel and thread targets must be in the channel this conversation is already in; user targets must be the requester themselves.',
  inputSchema: z.strictObject({
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
  outputSchema: z.strictObject({
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
  execute: ({ path, filename, comment, target }, context) =>
    uploadToSlack({
      comment,
      filename,
      path,
      requestContext: context.requestContext,
      target,
    }),
});
