import type { RequestContext } from '@mastra/core/request-context';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slackFileId } from '../../lib/ids';
import { formatBytes } from '../../lib/media';
import { requireSandbox, sandboxPath } from '../../workspace';
import { spendSlackCall } from './budget';
import { fetchPrivateSlackFile, readableFile } from './files';

async function downloadSlackFile({
  abortSignal,
  file,
  filename,
  requestContext,
}: {
  abortSignal?: AbortSignal;
  file: string;
  filename?: string;
  requestContext: RequestContext;
}) {
  const sandbox = await requireSandbox(requestContext);

  const fileId = slackFileId(file);
  if (!fileId) {
    throw new Error(
      `Not a Slack file id: "${file}". Pass a Slack file id like F0123ABCD (or a Slack file permalink that contains one). get_slack_file only downloads Slack files; use fetch_url for arbitrary web URLs.`
    );
  }

  spendSlackCall(requestContext);

  const { file: fileInfo } = await readableFile({ fileId, requestContext });
  const url = fileInfo.url_private_download ?? fileInfo.url_private;
  if (!url) {
    throw new Error(
      `Could not resolve a download URL for Slack file ${fileId}. It may have been deleted, or the bot may not have access to it.`
    );
  }
  const sanitized = (filename ?? fileInfo.name ?? fileId).replace(
    /[^\w.-]+/g,
    '_'
  );
  const name =
    sanitized === '' || sanitized === '.' || sanitized === '..'
      ? 'slack-file'
      : sanitized;
  const path = sandboxPath('downloads', name);
  const partPath = `${path}.${fileId}.part`;
  await sandbox.retryOnDead(() =>
    sandbox.e2b.files.makeDir(sandboxPath('downloads'))
  );

  const response = await fetchPrivateSlackFile({
    init: { signal: abortSignal },
    url,
  });
  if (!response.body) {
    throw new Error('Slack file response did not include a body.');
  }
  let size = 0;
  await sandbox.e2b.files.write(
    partPath,
    response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          size += chunk.byteLength;
          controller.enqueue(chunk);
        },
      })
    ),
    { signal: abortSignal, useOctetStream: true }
  );
  abortSignal?.throwIfAborted();
  if (fileInfo.size !== undefined && size !== fileInfo.size) {
    throw new Error(
      `Downloaded ${formatBytes(size)} of Slack file ${fileId} but expected ${formatBytes(fileInfo.size)}. Try again.`
    );
  }
  await sandbox.retryOnDead(async () => {
    // Removing a file that does not exist throws; that is the normal case.
    await sandbox.e2b.files.remove(path).catch(() => undefined);
    await sandbox.e2b.files.rename(partPath, path);
  });

  return { path, filename: name, mimeType: fileInfo.mimetype, size };
}

export const getSlackFileTool = createTool({
  id: 'get_slack_file',
  description:
    'Download one Slack upload, snippet, or image into the thread sandbox for reading or processing. Pass a Slack file id such as F0123ABCD, or a Slack file permalink containing one. Use fetch_url for web URLs and read_canvas for canvases. To look at a downloaded image, pass the saved path to view_image; read_file cannot show you a picture.',
  inputSchema: z.strictObject({
    file: z
      .string()
      .min(1)
      .describe(
        'A Slack file id (e.g. F0123ABCD). A Slack file permalink containing the id also works; the id is extracted from it.'
      ),
    filename: z.string().optional().describe('Optional name to save it as.'),
  }),
  outputSchema: z.strictObject({
    path: z.string(),
    filename: z.string(),
    mimeType: z.string().optional(),
    size: z.number(),
  }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: output?.filename ?? output?.path ?? 'File downloaded',
      }),
    },
  },
  execute: ({ file, filename }, context) =>
    downloadSlackFile({
      abortSignal: context.abortSignal,
      file,
      filename,
      requestContext: context.requestContext,
    }),
});
