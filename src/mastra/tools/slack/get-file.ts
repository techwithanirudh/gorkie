import { fetchSlackFile } from '@chat-adapter/slack/api';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '@/env';
import { slack } from '../../chat/client';
import { sh } from '../../lib/shell';
import { resolveE2BSandbox } from '../../workspace';
import { p } from '../../workspace/path';

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

export const getFileTool = createTool({
  id: 'get_file',
  description:
    'Download a Slack file (upload, snippet, image, canvas, any type) into the sandbox so you can read or process it. Accepts a Slack file URL, permalink, or file id. When downloading images, always pass or preserve a useful extension like .png, .jpg, .jpeg, or .webp so read_file can infer the MIME type.',
  inputSchema: z.object({
    file: z
      .string()
      .min(1)
      .describe('A Slack file URL, permalink, or file id (e.g. F0123ABCD).'),
    filename: z.string().optional().describe('Optional name to save it as.'),
  }),
  execute: async ({ file, filename }, context) => {
    if (!context?.requestContext) {
      throw new Error('No workspace context.');
    }
    const sandbox = await resolveE2BSandbox(context.requestContext);
    if (!sandbox) {
      throw new Error('No sandbox available.');
    }
    await sandbox.ensureRunning();

    const fileId = /(F[A-Z0-9]{6,})/.exec(file)?.[1];
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

    const defaultName = info?.name ?? fileId ?? 'slack-file';
    const name = (filename ?? defaultName).replace(/[^\w.-]+/g, '_');
    const path = p('downloads', name);
    await sandbox.retryOnDead(() => sandbox.e2b.files.makeDir(p('downloads')));
    const partPath = `${path}.part`;
    const nextPath = `${path}.next`;
    const mergePath = `${path}.merge`;
    const done = (size: number) => ({
      success: true,
      path,
      filename: name,
      mimeType: info?.mimetype,
      size,
      message: `Downloaded ${name} (${bytes(size)}) to ${path} in the sandbox.`,
    });
    const writeBody = async (
      body: ReadableStream<Uint8Array>,
      targetPath: string
    ) => {
      let downloaded = 0;
      await sandbox.retryOnDead(() =>
        sandbox.e2b.files.write(
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
        )
      );
      throwIfAborted(context.abortSignal);
      return downloaded;
    };
    const commitPart = async () => {
      await sandbox.retryOnDead(async () => {
        await sandbox.e2b.files.remove(path).catch(() => undefined);
        await sandbox.e2b.files.rename(partPath, path);
        await sandbox.e2b.files.remove(nextPath).catch(() => undefined);
        await sandbox.e2b.files.remove(mergePath).catch(() => undefined);
      });
    };
    const mergePart = async () => {
      const result = await sandbox.retryOnDead(() =>
        sandbox.e2b.commands.run(
          `cat ${sh(partPath)} ${sh(nextPath)} > ${sh(mergePath)} && mv ${sh(mergePath)} ${sh(partPath)} && rm -f ${sh(nextPath)}`
        )
      );
      if (result.exitCode !== 0) {
        throw new Error(`Failed to merge resumed download: ${result.stderr}`);
      }
    };
    const fetchFile = (start?: number) =>
      fetchSlackFile({
        fetch: (input, init) => {
          const requestHeaders = new Headers(init?.headers);
          if (start !== undefined) {
            requestHeaders.set('range', `bytes=${start}-`);
          }
          return fetch(input, {
            ...init,
            headers: requestHeaders,
            signal: context.abortSignal,
          });
        },
        token: env.SLACK_BOT_TOKEN,
        url,
      });
    const expectedSize =
      info?.size ??
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
      return done(expectedSize);
    }

    if (expectedSize === 0) {
      await sandbox.retryOnDead(() =>
        sandbox.e2b.commands.run(`rm -f ${sh(path)} && : > ${sh(path)}`)
      );
      return done(expectedSize);
    }

    const existingPart = await sandbox
      .retryOnDead(() => sandbox.e2b.files.getInfo(partPath))
      .catch(() => undefined);
    const resumeAt = existingPart?.size ?? 0;
    if (expectedSize !== undefined && resumeAt === expectedSize) {
      await commitPart();
      return done(expectedSize);
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

    const start =
      expectedSize !== undefined && resumeAt < expectedSize ? resumeAt : 0;
    const res = await fetchFile(start > 0 ? start : undefined);
    if (!(res.ok && (start === 0 || res.status === 206))) {
      throw new Error(`Failed to download Slack file: ${res.status}`);
    }
    if (!res.body) {
      throw new Error('Slack file response did not include a body.');
    }

    const downloadedSize = await writeBody(
      res.body,
      start > 0 ? nextPath : partPath
    );

    if (start > 0) {
      await mergePart();
    }

    const finalPart = await sandbox.retryOnDead(() =>
      sandbox.e2b.files.getInfo(partPath)
    );
    if (expectedSize !== undefined && finalPart.size !== expectedSize) {
      throw new Error(
        `Downloaded ${bytes(finalPart.size)} but expected ${bytes(expectedSize)}.`
      );
    }
    await commitPart();

    return done(expectedSize ?? downloadedSize);
  },
});
