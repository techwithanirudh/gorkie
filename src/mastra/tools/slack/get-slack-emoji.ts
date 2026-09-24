import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { emoji as emojiConfig, image } from '../../config';
import { spendSlackCall } from '../../lib/slack-budget';
import {
  // TODO(slopradar): CODING_STANDARDS: direct names | `sandboxPath as p` alias (see artifacts.ts band) | import `sandboxPath` unaliased
  sandboxPath as p,
  requireSandbox,
  writeSandboxFile,
} from '../../workspace';
import { viewableImageType } from '../view-image';

let cachedList:
  | { emoji: Record<string, string>; expiresAt: number }
  | undefined;

export const getSlackEmojiTool = createTool({
  id: 'get_slack_emoji',
  description:
    "Fetch one of this workspace's custom Slack emoji by name, save its image into the sandbox, and show it to you. Aliases are followed to the original image. Use the saved path to edit it, upload it, or reuse it. Standard Unicode emoji are not custom and return custom: false.",
  inputSchema: z.strictObject({
    name: z
      .string()
      .min(1)
      .describe(
        'Emoji shortcode, with or without colons, e.g. :party-parrot:.'
      ),
  }),
  outputSchema: z.discriminatedUnion('custom', [
    z.strictObject({
      custom: z.literal(true),
      name: z.string(),
      path: z.string(),
      mediaType: z.string(),
      data: z.string(),
    }),
    z.strictObject({
      custom: z.literal(false),
      name: z.string(),
      message: z.string(),
    }),
  ]),
  transform: {
    display: {
      output: ({ output: out }) => ({
        summary: out?.custom
          ? `Fetched :${out.name}:`
          : `:${out?.name ?? ''}: is not a custom emoji`,
      }),
    },
  },
  toModelOutput: (out) =>
    out.custom
      ? {
          type: 'content',
          value: [
            { type: 'text', text: `:${out.name}: saved to ${out.path}` },
            { type: 'media', data: out.data, mediaType: out.mediaType },
          ],
        }
      : { type: 'text', value: out.message },
  execute: async ({ name: shortcode }, context) => {
    // Slack writes skin tones as :name::skin-tone-2:, so keep only the base name.
    const [name] = shortcode.trim().replace(/^:+/, '').split(':');
    if (!name) {
      throw new Error('Pass an emoji name, e.g. party-parrot.');
    }
    if (!cachedList || cachedList.expiresAt < Date.now()) {
      spendSlackCall(context.requestContext);
      const response = await slack.webClient.emoji.list();
      cachedList = {
        emoji: response.emoji ?? {},
        expiresAt: Date.now() + emojiConfig.listTtl,
      };
    }

    let current = name;
    let url: string | undefined;
    for (let hops = 0; hops < 5 && !url; hops++) {
      const entry = cachedList.emoji[current];
      if (!entry) {
        break;
      }
      if (entry.startsWith('alias:')) {
        current = entry.slice('alias:'.length);
      } else {
        url = entry;
      }
    }
    if (!url) {
      return {
        custom: false as const,
        name,
        message:
          current === name
            ? `:${name}: is not a custom emoji in this workspace. It is either a standard Unicode emoji or does not exist.`
            : `:${name}: is an alias for :${current}:, which is not a custom emoji in this workspace (likely a standard Unicode emoji).`,
      };
    }

    const parsedUrl = new URL(url);
    if (
      parsedUrl.protocol !== 'https:' ||
      parsedUrl.hostname !== 'emoji.slack-edge.com'
    ) {
      throw new Error(
        `Refusing to fetch :${name}: from ${parsedUrl.hostname}, which is not Slack's emoji CDN.`
      );
    }
    const response = await fetch(parsedUrl, {
      redirect: 'error',
      signal: context.abortSignal,
    });
    if (!response.ok) {
      throw new Error(`Failed to download :${name}: (${response.status}).`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > image.maxViewBytes) {
      throw new Error(`:${name}: is too large to view inline.`);
    }
    const mediaType = viewableImageType(bytes);
    if (!mediaType) {
      throw new Error(
        `:${name}: is not a viewable image (png, jpeg, gif, webp).`
      );
    }

    const sandbox = await requireSandbox(context.requestContext);
    const path = p(
      'emoji',
      `${name.replace(/[^\w+-]/g, '_')}.${mediaType.split('/')[1]}`
    );
    await writeSandboxFile({ data: bytes.buffer, path, sandbox });

    return {
      custom: true as const,
      name,
      path,
      mediaType,
      data: Buffer.from(bytes).toString('base64'),
    };
  },
});
