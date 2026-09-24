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
        // TODO(slopradar): review: weak fallback | `split('/').pop()` never returns undefined, so `?? name` is dead and a trailing-slash path yields an empty filename | `posix.basename(path) || name`
        path.split('/').pop() ?? name
      );
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
