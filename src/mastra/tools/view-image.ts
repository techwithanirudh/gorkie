import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { image } from '../config';
import { input, output } from '../types/tools/index';
import { requireSandbox } from '../workspace';

const IMAGE_MEDIA_TYPES: Record<string, string> = {
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export const viewImageTool = createTool({
  id: 'view_image',
  description:
    'Look at an image in the sandbox (png, jpeg, gif, webp) so you can actually see it. Pass just the path. This is how you view an image: read_file with an encoding returns text or base64, which you cannot see.',
  inputSchema: input({
    path: z.string().min(1).describe('Sandbox path to the image file.'),
  }),
  outputSchema: output({
    path: z.string(),
    mediaType: z.string(),
    data: z.string(),
  }),
  transform: {
    display: {
      output: ({ output: out }) => ({
        summary: `Viewed ${out?.path.split('/').at(-1) ?? 'image'}`,
      }),
    },
  },
  // Surface the bytes as a native media part the model can see, mirroring
  // Mastra read_file's media handling. moveToolImages then relocates it into a
  // user message, since the OpenAI-compatible gateways drop media in tool
  // results.
  toModelOutput: (out) => ({
    type: 'content',
    value: [
      { type: 'text', text: `${out.path} (${out.mediaType})` },
      { type: 'media', data: out.data, mediaType: out.mediaType },
    ],
  }),
  execute: async ({ path }, context) => {
    if (!context?.requestContext) {
      throw new Error('No workspace context.');
    }
    const mediaType =
      IMAGE_MEDIA_TYPES[path.split('.').at(-1)?.toLowerCase() ?? ''];
    if (!mediaType) {
      throw new Error(
        `${path} is not a viewable image (png, jpeg, gif, webp). Use read_file for other files.`
      );
    }
    const sandbox = await requireSandbox(context.requestContext);
    const stat = await sandbox.retryOnDead(() =>
      sandbox.e2b.files.getInfo(path)
    );
    if (stat.size > image.maxViewBytes) {
      throw new Error(
        `${path} is ${Math.round(stat.size / 1_000_000)}MB, too large to view inline.`
      );
    }
    const bytes = await sandbox.retryOnDead(() =>
      sandbox.e2b.files.read(path, { format: 'bytes' })
    );
    return {
      path,
      mediaType,
      data: Buffer.from(bytes).toString('base64'),
    };
  },
});
