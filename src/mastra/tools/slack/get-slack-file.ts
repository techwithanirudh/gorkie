import type { RequestContext } from '@mastra/core/request-context';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { spendSlackCall } from '../../lib/slack-budget';
import { sh } from '../../lib/utils';
// TODO(slopradar): CODING_STANDARDS: direct names | `sandboxPath as p` alias (see artifacts.ts band) | import `sandboxPath` unaliased
import { sandboxPath as p, requireSandbox } from '../../workspace';
import { fetchPrivateSlackFile, readableFile } from './utils';

function formatBytes(value: number): string {
  if (value < 1024 * 1024) {
    return `${Math.ceil(value / 1024)} KB`;
  }
  return `${Math.ceil(value / 1024 / 1024)} MB`;
}

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

  const fileId = /(?<![A-Z0-9])(F[A-Z0-9]{6,})/.exec(file)?.[1];
  if (!fileId) {
    throw new Error(
      `Not a Slack file id: "${file}". Pass a Slack file id like F0123ABCD (or a Slack file permalink that contains one). get_slack_file only downloads Slack files; use fetch_url for arbitrary web URLs.`
    );
  }

  spendSlackCall(requestContext);

  const { file: fileInfo } = await readableFile({ fileId, requestContext });
  const url = fileInfo?.url_private_download ?? fileInfo?.url_private;
  if (!url) {
    throw new Error(
      `Could not resolve a download URL for Slack file ${fileId}. It may have been deleted, or the bot may not have access to it.`
    );
  }
  const sanitized = (filename ?? fileInfo?.name ?? fileId).replace(
    /[^\w.-]+/g,
    '_'
  );
  const name =
    sanitized === '' || sanitized === '.' || sanitized === '..'
      ? 'slack-file'
      : sanitized;
  const path = p('downloads', name);
  await sandbox.retryOnDead(() => sandbox.e2b.files.makeDir(p('downloads')));
  // TODO(slopradar): simplification: over-engineering (owner question) | ~100 lines of cross-call resume (.part/.next/.merge files, Range requests, cat merge) for a tool that downloads one Slack file per call; a resume only helps when an earlier call died mid-stream with the same name | stream straight to `${path}.part`, verify size, rename; drop the Range/merge path unless a real large-file failure justifies it
  const partPath = `${path}.${fileId}.part`;
  const nextPath = `${path}.${fileId}.next`;
  const mergePath = `${path}.${fileId}.merge`;
  const formatResult = (size: number) => ({
    path,
    filename: name,
    mimeType: fileInfo?.mimetype,
    size,
  });
  // Removing a leftover that does not exist throws; that is the normal case.
  const commitDownload = async () => {
    await sandbox.retryOnDead(async () => {
      await sandbox.e2b.files.remove(path).catch(() => undefined);
      await sandbox.e2b.files.rename(partPath, path);
      await sandbox.e2b.files.remove(nextPath).catch(() => undefined);
      await sandbox.e2b.files.remove(mergePath).catch(() => undefined);
    });
  };
  const expectedSize =
    fileInfo?.size ??
    // TODO(slopradar): CODING_STANDARDS: no swallowed catch | a failed HEAD is silently dropped and the download then skips size verification | log at debug with the error, or say why it is ignorable
    (await fetchPrivateSlackFile({ method: 'HEAD', signal: abortSignal, url })
      .then((response) =>
        // A missing header is unknown, not zero: Number(null) is 0.
        Number(response.headers.get('content-length') ?? Number.NaN)
      )
      .then((size) => (Number.isFinite(size) && size >= 0 ? size : undefined))
      .catch(() => undefined));

  // getInfo throws when there is no earlier download to reuse or resume.
  // TODO(slopradar): review: correctness | the reuse check keys on filename + size, not file id, so a different Slack file with the same sanitized name and byte size (e.g. two `image.png` uploads) returns the old file's contents | include the fileId in the saved name, or store and compare the file id
  const existingFinal = await sandbox
    .retryOnDead(() => sandbox.e2b.files.getInfo(path))
    .catch(() => undefined);
  if (expectedSize !== undefined && existingFinal?.size === expectedSize) {
    return formatResult(expectedSize);
  }

  if (expectedSize === 0) {
    await sandbox.retryOnDead(() =>
      sandbox.e2b.commands.run(`rm -f ${sh(path)} && : > ${sh(path)}`)
    );
    return formatResult(expectedSize);
  }

  const existingPart = await sandbox
    .retryOnDead(() => sandbox.e2b.files.getInfo(partPath))
    .catch(() => undefined);
  const resumeAt = existingPart?.size ?? 0;
  if (expectedSize !== undefined && resumeAt === expectedSize) {
    await commitDownload();
    return formatResult(expectedSize);
  }

  if (expectedSize !== undefined && resumeAt > expectedSize) {
    await sandbox.retryOnDead(() =>
      sandbox.e2b.files.remove(partPath).catch(() => undefined)
    );
  }

  await sandbox.retryOnDead(async () => {
    await sandbox.e2b.files.remove(nextPath).catch(() => undefined);
    await sandbox.e2b.files.remove(mergePath).catch(() => undefined);
  });

  const resumeOffset =
    expectedSize !== undefined && resumeAt < expectedSize ? resumeAt : 0;
  // fetchPrivateSlackFile throws on any non-2xx, so only a resume the server
  // answered in full instead of from the offset is left to catch.
  const response = await fetchPrivateSlackFile({
    ...(resumeOffset > 0
      ? { headers: { range: `bytes=${resumeOffset}-` } }
      : {}),
    signal: abortSignal,
    url,
  });
  if (resumeOffset > 0 && response.status !== 206) {
    throw new Error(`Failed to download Slack file: ${response.status}`);
  }
  if (!response.body) {
    throw new Error('Slack file response did not include a body.');
  }

  let downloadedSize = 0;
  await sandbox.e2b.files.write(
    resumeOffset > 0 ? nextPath : partPath,
    response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          abortSignal?.throwIfAborted();
          downloadedSize += chunk.byteLength;
          controller.enqueue(chunk);
        },
      })
    ),
    { signal: abortSignal, useOctetStream: true }
  );
  abortSignal?.throwIfAborted();

  if (resumeOffset > 0) {
    const merged = await sandbox.retryOnDead(() =>
      sandbox.e2b.commands.run(
        `cat ${sh(partPath)} ${sh(nextPath)} > ${sh(mergePath)} && mv ${sh(mergePath)} ${sh(partPath)} && rm -f ${sh(nextPath)}`
      )
    );
    if (merged.exitCode !== 0) {
      throw new Error(`Failed to merge resumed download: ${merged.stderr}`);
    }
  }

  const finalPart = await sandbox.retryOnDead(() =>
    sandbox.e2b.files.getInfo(partPath)
  );
  if (expectedSize !== undefined && finalPart.size !== expectedSize) {
    throw new Error(
      `Downloaded ${formatBytes(finalPart.size)} but expected ${formatBytes(expectedSize)}.`
    );
  }
  await commitDownload();

  return formatResult(expectedSize ?? downloadedSize);
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
