import { fetchSlackFile } from '@chat-adapter/slack/api';
import type { RequestContext } from '@mastra/core/request-context';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '@/env';
import { spendSlackCall } from '../../lib/slack-budget';
import { sh } from '../../lib/utils';
import { sandboxPath as p, requireSandbox } from '../../workspace';
import { readableFile } from './utils';

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
  // Keyed on the file id so a partial of another file saved under the same
  // name is never resumed into this one.
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
    (await fetch(url, {
      headers: { authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
      method: 'HEAD',
      signal: abortSignal,
    })
      .then((response) => Number(response.headers.get('content-length')))
      .then((size) => (Number.isFinite(size) && size >= 0 ? size : undefined))
      // Without a size the download still works, it just cannot resume.
      .catch(() => undefined));

  // getInfo throws when there is no earlier download to reuse or resume.
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
  const response = await fetchSlackFile({
    fetch: Object.assign(
      (input: URL | RequestInfo, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        if (resumeOffset > 0) {
          headers.set('range', `bytes=${resumeOffset}-`);
        }
        return fetch(input, { ...init, headers, signal: abortSignal });
      },
      { preconnect: fetch.preconnect }
    ),
    token: env.SLACK_BOT_TOKEN,
    url,
  });
  if (!(response.ok && (resumeOffset === 0 || response.status === 206))) {
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
    'Download one Slack upload, snippet, or image into the thread sandbox for reading or processing. Pass a Slack file id such as F0123ABCD, or a Slack file permalink containing one. Use fetch_url for web URLs and read_canvas for canvases. Preserve a useful image extension so read_file can infer its MIME type.',
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
