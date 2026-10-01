import { posix } from 'node:path';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '@/env';
import { emoji } from '../config';
import { requireSandbox } from '../workspace';
import { confinePath } from '../workspace/filesystem';

export const uploadEmojiTool = createTool({
  id: 'upload_emoji',
  description:
    'Add a custom Slack emoji. Pass path (a sandbox image file) to upload a new emoji, or aliasFor (an existing emoji name) to create an alias instead. Exactly one of the two is required.',
  inputSchema: z
    .strictObject({
      name: z
        .string()
        .regex(
          /^[a-z0-9_+-]+$/,
          'Emoji names are lowercase letters, numbers, dashes, and underscores only, no spaces or colons.'
        )
        .describe('The new emoji name, without colons.'),
      path: z
        .string()
        .optional()
        .describe('Sandbox path to the image to upload as a new emoji.'),
      aliasFor: z
        .string()
        .optional()
        .describe(
          'Name of an existing emoji to alias, instead of uploading a new image.'
        ),
    })
    .refine((value) => Boolean(value.path) !== Boolean(value.aliasFor), {
      message: 'Pass exactly one of path or aliasFor.',
    }),
  outputSchema: z.strictObject({
    name: z.string(),
  }),
  transform: {
    display: {
      output: ({ output: out }) => ({
        summary: `Added :${out?.name ?? ''}:`,
      }),
    },
  },
  execute: async ({ name, path, aliasFor }, context) => {
    // TODO(slopradar): dead tool : upload_emoji is always registered in deferredTools, so with EMOJI_PROXY_TOKEN unset tool search offers a tool that can only throw → add it to deferredTools in toolsets.ts only when env.EMOJI_PROXY_TOKEN is set, and drop this check
    if (!env.EMOJI_PROXY_TOKEN) {
      throw new Error(
        'Emoji upload is not configured. Set EMOJI_PROXY_TOKEN to enable it.'
      );
    }
    const headers = { authorization: `Bearer ${env.EMOJI_PROXY_TOKEN}` };

    let response: Response;
    if (path) {
      const filePath = confinePath({ inputPath: path });
      const sandbox = await requireSandbox(context.requestContext);
      const { size } = await sandbox.retryOnDead(() =>
        sandbox.e2b.files.getInfo(filePath)
      );
      if (size > emoji.maxUploadBytes) {
        // TODO(slopradar): duplication across files : five hand-written byte formatters disagree (here and view-image.ts, upload-file.ts use 1_000_000 and round to 0MB under 500KB; generate-image/request.ts uses 1024*1024; get-slack-file.ts has formatBytes) → one formatBytes in src/mastra/lib, or `pretty-bytes` (dependency change: ask)
        throw new Error(
          `${path} is ${Math.round(size / 1_000_000)}MB, too large for an emoji. Shrink it first.`
        );
      }
      const bytes = await sandbox.retryOnDead(() =>
        sandbox.e2b.files.read(filePath, { format: 'bytes' })
      );
      const form = new FormData();
      form.set('name', name);
      form.set(
        'file',
        new Blob([new Uint8Array(bytes)]),
        posix.basename(path) || name
      );
      // TODO(slopradar): unbounded IO : both proxy fetches pass neither context.abortSignal nor a timeout, so a hung proxy holds the turn until the step limit (x2 in this file) → pass AbortSignal.any([context.abortSignal, AbortSignal.timeout(emoji.requestTimeoutMs)]) with the timeout in config.ts
      response = await fetch(`${emoji.proxyUrl}/upload`, {
        method: 'POST',
        headers,
        body: form,
      });
    } else {
      response = await fetch(`${emoji.proxyUrl}/alias`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ name, alias_for: aliasFor }),
      });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Emoji ${path ? 'upload' : 'alias'} failed (${response.status}): ${body.slice(0, 300)}`
      );
    }

    return { name };
  },
});
