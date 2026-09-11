import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '@/env';
import { input, output } from '../types/tools/index';
import { requireSandbox } from '../workspace';

const EMOJI_PROXY_URL =
  'https://hackclub-slack-emoji-proxy.vercel.app/api/emoji';

export const uploadEmojiTool = createTool({
  id: 'upload_emoji',
  description:
    'Add a custom Slack emoji. Pass path (a sandbox image file) to upload a new emoji, or aliasFor (an existing emoji name) to create an alias instead. Exactly one of the two is required.',
  inputSchema: input({
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
  }).refine((value) => Boolean(value.path) !== Boolean(value.aliasFor), {
    message: 'Pass exactly one of path or aliasFor.',
  }),
  outputSchema: output({
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
    if (aliasFor) {
      response = await fetch(`${EMOJI_PROXY_URL}/alias`, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ name, alias_for: aliasFor }),
      });
    } else {
      if (!path) {
        throw new Error('Pass path to upload a new emoji.');
      }
      if (!context?.requestContext) {
        throw new Error('No workspace context.');
      }
      const sandbox = await requireSandbox(context.requestContext);
      // Turn end pauses the sandbox, and `retryOnDead` cannot recover a paused
      // one: it throws `SandboxNotReadyError`, which matches no branch of
      // `isSandboxDeadError`.
      await sandbox.ensureRunning();
      const bytes = await sandbox.retryOnDead(() =>
        sandbox.e2b.files.read(path, { format: 'bytes' })
      );
      const form = new FormData();
      form.set('name', name);
      form.set(
        'file',
        new Blob([new Uint8Array(bytes)]),
        path.split('/').pop() ?? name
      );
      response = await fetch(`${EMOJI_PROXY_URL}/upload`, {
        method: 'POST',
        headers,
        body: form,
      });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Emoji ${aliasFor ? 'alias' : 'upload'} failed (${response.status}): ${body.slice(0, 300)}`
      );
    }

    return { name };
  },
});
