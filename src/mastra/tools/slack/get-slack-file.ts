import { fetchSlackFile } from '@chat-adapter/slack/api';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '@/env';
import { slack } from '../../chat/client';
import { image } from '../../config';
import { channelContext } from '../../lib/context';
import { viewableImageType } from '../../lib/media';
import { spendSlackCall } from '../../lib/slack-budget';
import { sh } from '../../lib/utils';
import { input, output } from '../../types/tools/index';
import { sandboxPath as p, requireSandbox } from '../../workspace';
import { downloadEmoji } from './emoji';
import { assertReadableResource } from './utils';

function formatBytes(value: number): string {
  if (value < 1024 * 1024) {
    return `${Math.ceil(value / 1024)} KB`;
  }
  return `${Math.ceil(value / 1024 / 1024)} MB`;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('File download aborted.');
  }
}

export const getSlackFileTool = createTool({
  id: 'get_slack_file',
  description:
    'Download a Slack file or custom emoji into the thread sandbox and show supported images directly. Pass :emoji-name: for a custom emoji. Pass a Slack file id such as F0123ABCD, or a Slack file permalink containing one. Use fetch_url for web URLs and read_canvas for canvases. Non-images and images over the inline limit return their saved path.',
  inputSchema: input({
    file: z
      .string()
      .min(1)
      .describe(
        'Slack file id, file permalink, or custom emoji shortcode such as :party-parrot:.'
      ),
    filename: z.string().optional().describe('Optional name to save it as.'),
  }),
  outputSchema: output({
    path: z.string(),
    filename: z.string(),
    mimeType: z.string().optional(),
    size: z.number(),
    data: z.string().optional(),
  }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: output?.filename ?? output?.path ?? 'File downloaded',
      }),
    },
  },
  toModelOutput: (out) =>
    out.data && out.mimeType
      ? {
          type: 'content',
          value: [
            { type: 'text', text: `${out.filename} saved to ${out.path}` },
            { type: 'media', data: out.data, mediaType: out.mimeType },
          ],
        }
      : { type: 'text', value: JSON.stringify(out) },
  execute: async ({ file, filename }, context) => {
    if (!context?.requestContext) {
      throw new Error('No workspace context.');
    }
    const sandbox = await requireSandbox(context.requestContext);

    if (/^:[^:]+:(?::skin-tone-[2-6]:)?$/.test(file.trim())) {
      return downloadEmoji({
        shortcode: file,
        filename,
        sandbox,
        requestContext: context.requestContext,
        signal: context.abortSignal,
      });
    }

    const fileId = /(F[A-Z0-9]{6,})/.exec(file)?.[1];
    if (!fileId) {
      throw new Error(
        `Not a Slack file id: "${file}". Pass a Slack file id like F0123ABCD (or a Slack file permalink that contains one). get_slack_file only downloads Slack files; use fetch_url for arbitrary web URLs.`
      );
    }

    spendSlackCall(context?.requestContext);

    const fileInfo = (await slack.webClient.files.info({ file: fileId })).file;
    await assertReadableResource({
      channelIds: [
        ...(fileInfo?.channels ?? []),
        ...(fileInfo?.groups ?? []),
        ...(fileInfo?.ims ?? []),
      ],
      currentThreadId: channelContext(context.requestContext).threadId,
    });
    const url = fileInfo?.url_private_download ?? fileInfo?.url_private;
    if (!url) {
      throw new Error(
        `Could not resolve a download URL for Slack file ${fileId}. It may have been deleted, or the bot may not have access to it.`
      );
    }
    const defaultName = fileInfo?.name ?? fileId;
    const sanitized = (filename ?? defaultName).replace(/[^\w.-]+/g, '_');
    const name =
      sanitized === '' || sanitized === '.' || sanitized === '..'
        ? 'slack-file'
        : sanitized;
    const path = p('downloads', name);
    await sandbox.retryOnDead(() => sandbox.e2b.files.makeDir(p('downloads')));
    const partPath = `${path}.part`;
    const nextPath = `${path}.next`;
    const mergePath = `${path}.merge`;
    const formatResult = async (size: number) => {
      const result = {
        path,
        filename: name,
        mimeType: fileInfo?.mimetype,
        size,
      };
      if (size === 0 || size > image.maxViewBytes) {
        return result;
      }
      const bytes = Buffer.from(
        await sandbox.retryOnDead(() =>
          sandbox.e2b.files.read(path, { format: 'bytes' })
        )
      );
      const mimeType = viewableImageType(bytes);
      return mimeType && bytes.byteLength <= image.maxViewBytes
        ? { ...result, mimeType, data: bytes.toString('base64') }
        : result;
    };
    const writeResponseBody = async (
      body: ReadableStream<Uint8Array>,
      targetPath: string
    ) => {
      let downloaded = 0;
      // Not wrapped in retryOnDead: a ReadableStream is single-use, so a retry
      // would re-pipe an already-locked stream (and double-count `downloaded`).
      // A dead sandbox mid-download surfaces as an error; the next call resumes
      // from the `.part` file instead.
      await sandbox.e2b.files.write(
        targetPath,
        body.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              throwIfAborted(context.abortSignal);
              downloaded += chunk.byteLength;
              controller.enqueue(chunk);
            },
          })
        ),
        { signal: context.abortSignal, useOctetStream: true }
      );
      throwIfAborted(context.abortSignal);
      return downloaded;
    };
    const commitDownload = async () => {
      await sandbox.retryOnDead(async () => {
        await sandbox.e2b.files.remove(path).catch(() => undefined);
        await sandbox.e2b.files.rename(partPath, path);
        await sandbox.e2b.files.remove(nextPath).catch(() => undefined);
        await sandbox.e2b.files.remove(mergePath).catch(() => undefined);
      });
    };
    const mergeDownload = async () => {
      const result = await sandbox.retryOnDead(() =>
        sandbox.e2b.commands.run(
          `cat ${sh(partPath)} ${sh(nextPath)} > ${sh(mergePath)} && mv ${sh(mergePath)} ${sh(partPath)} && rm -f ${sh(nextPath)}`
        )
      );
      if (result.exitCode !== 0) {
        throw new Error(`Failed to merge resumed download: ${result.stderr}`);
      }
    };
    const fetchResponse = (resumeOffset?: number) => {
      const fetchWithRange = Object.assign(
        (input: URL | RequestInfo, init?: RequestInit) => {
          const requestHeaders = new Headers(init?.headers);
          if (resumeOffset !== undefined) {
            requestHeaders.set('range', `bytes=${resumeOffset}-`);
          }
          return fetch(input, {
            ...init,
            headers: requestHeaders,
            signal: context.abortSignal,
          });
        },
        { preconnect: fetch.preconnect }
      );

      return fetchSlackFile({
        fetch: fetchWithRange,
        token: env.SLACK_BOT_TOKEN,
        url,
      });
    };
    const expectedSize =
      fileInfo?.size ??
      (await fetch(url, {
        headers: { authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
        method: 'HEAD',
        signal: context.abortSignal,
      })
        .then((response) => Number(response.headers.get('content-length')))
        .then((size) => (Number.isFinite(size) && size >= 0 ? size : undefined))
        .catch(() => undefined));

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
    const response = await fetchResponse(
      resumeOffset > 0 ? resumeOffset : undefined
    );
    if (!(response.ok && (resumeOffset === 0 || response.status === 206))) {
      throw new Error(`Failed to download Slack file: ${response.status}`);
    }
    if (!response.body) {
      throw new Error('Slack file response did not include a body.');
    }

    const downloadedSize = await writeResponseBody(
      response.body,
      resumeOffset > 0 ? nextPath : partPath
    );

    if (resumeOffset > 0) {
      await mergeDownload();
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
  },
});
