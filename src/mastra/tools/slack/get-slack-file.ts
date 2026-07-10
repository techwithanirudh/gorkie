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

// The only URL get_slack_file ever fetches is the url_private(_download)
// returned by Slack's files.info for a resolved file id — never a caller-
// supplied URL — so the workspace bot token is only ever sent to Slack. This
// stays as defense-in-depth: assert the resolved URL is Slack-owned before
// attaching the token, so a spoofed/compromised files.info response can't
// redirect the credential elsewhere.
function isSlackHost(rawUrl: string): boolean {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (
    host === 'slack.com' ||
    host.endsWith('.slack.com') ||
    host === 'slack-files.com' ||
    host.endsWith('.slack-files.com')
  );
}

// TODO: custom emoji download by shortcode (e.g. :partyparrot:) was removed
export const getSlackFileTool = createTool({
  id: 'get_slack_file',
  description:
    'Download a Slack file (upload, snippet, image, canvas, any type) into the sandbox so you can read or process it. Takes a Slack file id (e.g. F0123ABCD), which you can get from a message attachment or a Slack file permalink. Not for arbitrary web URLs — use fetch_url for those. When downloading images, pass a filename with the correct extension (.png, .jpg, .jpeg, .webp).',
  inputSchema: z.object({
    file: z
      .string()
      .min(1)
      .describe(
        'A Slack file id (e.g. F0123ABCD). A Slack file permalink containing the id also works; the id is extracted from it.'
      ),
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
    if (!fileId) {
      throw new Error(
        `Not a Slack file id: "${file}". Pass a Slack file id like F0123ABCD (or a Slack file permalink that contains one). get_slack_file only downloads Slack files; use fetch_url for arbitrary web URLs.`
      );
    }

    const info = (await slack.webClient.files.info({ file: fileId })).file;
    const url = info?.url_private_download ?? info?.url_private;
    if (!url) {
      throw new Error(
        `Could not resolve a download URL for Slack file ${fileId}. It may have been deleted, or Gorkie may not have access to it.`
      );
    }
    if (!isSlackHost(url)) {
      throw new Error(
        `Refusing to download from a non-Slack host: ${url}. get_slack_file only downloads Slack-hosted files (it authenticates with the workspace token).`
      );
    }

    const defaultName = info?.name ?? fileId;
    // Strip path separators and reject bare "." / ".." so a crafted filename
    // can't escape the downloads/ directory when joined into the sandbox path.
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
