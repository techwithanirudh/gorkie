import { fetchSlackFile } from '@chat-adapter/slack/api';
import { createTool } from '@mastra/core/tools';
import type { E2BSandbox } from '@mastra/e2b';
import { z } from 'zod';
import { env } from '@/env';
import { slack } from '../chat/client';
import { p } from '../workspace/path';

const SLACK_FILE_ID = /(F[A-Z0-9]{6,})/;

function bytes(value: number): string {
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

function sh(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export const getFileTool = createTool({
  id: 'get_file',
  description:
    'Download a Slack file (upload, snippet, image, canvas, any type) into the sandbox so you can read or process it. Accepts a Slack file URL, permalink, or file id. When downloading images, pass a filename with the correct extension (.png, .jpg, .jpeg, .webp)..',
  inputSchema: z.object({
    file: z
      .string()
      .min(1)
      .describe('A Slack file URL, permalink, or file id (e.g. F0123ABCD).'),
    filename: z.string().optional().describe('Optional name to save it as.'),
  }),
  execute: async ({ file, filename }, context) => {
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

    const fileId = SLACK_FILE_ID.exec(file)?.[1];
    const info = fileId
      ? (await slack.webClient.files.info({ file: fileId })).file
      : undefined;
    const url =
      info?.url_private_download ??
      info?.url_private ??
      (file.startsWith('http') ? file : undefined);
    if (!url) {
      throw new Error(`Could not resolve a download URL for: ${file}`);
    }

    const name = (filename ?? info?.name ?? fileId ?? 'slack-file').replace(
      /[^\w.-]+/g,
      '_'
    );
    const path = p('downloads', name);
    const tempPath = `${path}.part`;
    const rangePath = `${tempPath}.range`;
    const pendingRange = await sandbox
      .retryOnDead(() => sandbox.e2b.files.getInfo(rangePath))
      .catch(() => undefined);
    if (pendingRange && pendingRange.size > 0) {
      const result = await sandbox.retryOnDead(() =>
        sandbox.e2b.commands.run(
          `if [ -e ${sh(tempPath)} ]; then cat ${sh(rangePath)} >> ${sh(tempPath)}; else mv ${sh(rangePath)} ${sh(tempPath)}; fi && rm -f ${sh(rangePath)}`
        )
      );
      if (result.exitCode !== 0) {
        throw new Error(
          `Failed to preserve resumed download progress: ${result.stderr}`
        );
      }
    }
    const existingPart = await sandbox
      .retryOnDead(() => sandbox.e2b.files.getInfo(tempPath))
      .catch(() => undefined);
    let resumeAt = existingPart?.size ?? 0;
    let downloaded = resumeAt;

    const fetchFile = (start?: number) =>
      fetchSlackFile({
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (start && start > 0) {
            headers.set('range', `bytes=${start}-`);
          }
          return fetch(input, {
            ...init,
            headers,
            signal: context.abortSignal,
          });
        },
        token: env.SLACK_BOT_TOKEN,
        url,
      });

    throwIfAborted(context.abortSignal);
    let res = await fetchFile(resumeAt);
    if (resumeAt > 0 && res.status !== 206) {
      resumeAt = 0;
      downloaded = 0;
      res = await fetchFile();
    }
    if (!res.ok) {
      throw new Error(`Failed to download Slack file: ${res.status}`);
    }
    throwIfAborted(context.abortSignal);
    if (!res.body) {
      throw new Error('Slack file response did not include a body.');
    }
    const expectedSize =
      info?.size ??
      (res.status === 206
        ? Number(res.headers.get('content-range')?.split('/').at(-1)) ||
          undefined
        : Number(res.headers.get('content-length')) || undefined);

    if (expectedSize && resumeAt >= expectedSize) {
      await sandbox.retryOnDead(async () => {
        await sandbox.e2b.files.remove(path).catch(() => undefined);
        await sandbox.e2b.files.rename(tempPath, path);
      });
      return {
        success: true,
        path,
        filename: name,
        mimeType: info?.mimetype,
        size: resumeAt,
        message: `Downloaded ${name} (${bytes(resumeAt)}) to ${path} in the sandbox.`,
      };
    }

    const streamPath = resumeAt > 0 ? rangePath : tempPath;
    if (streamPath !== tempPath) {
      await sandbox.retryOnDead(() =>
        sandbox.e2b.files.remove(streamPath).catch(() => undefined)
      );
    }

    const stream = res.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          throwIfAborted(context.abortSignal);
          downloaded += chunk.byteLength;
          controller.enqueue(chunk);
        },
      })
    );

    await sandbox.retryOnDead(() =>
      sandbox.e2b.files.write(streamPath, stream, {
        signal: context.abortSignal,
        useOctetStream: true,
      })
    );
    throwIfAborted(context.abortSignal);
    if (streamPath !== tempPath) {
      const result = await sandbox.retryOnDead(() =>
        sandbox.e2b.commands.run(
          `cat ${sh(streamPath)} >> ${sh(tempPath)} && rm -f ${sh(streamPath)}`
        )
      );
      if (result.exitCode !== 0) {
        throw new Error(`Failed to append resumed download: ${result.stderr}`);
      }
    }

    if (expectedSize && downloaded !== expectedSize) {
      throw new Error(
        `Downloaded ${bytes(downloaded)} but expected ${bytes(expectedSize)}.`
      );
    }
    await sandbox.retryOnDead(async () => {
      await sandbox.e2b.files.remove(path).catch(() => undefined);
      await sandbox.e2b.files.rename(tempPath, path);
    });

    return {
      success: true,
      path,
      filename: name,
      mimeType: info?.mimetype,
      size: downloaded,
      message: `Downloaded ${name} (${bytes(downloaded)}) to ${path} in the sandbox.`,
    };
  },
});
