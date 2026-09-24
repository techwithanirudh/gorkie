import { detectMediaType } from '@ai-sdk/provider-utils';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { image } from '../config';
import { requireSandbox } from '../workspace';
import { confinePath } from '../workspace/filesystem';

export function viewableImageType(bytes: Uint8Array): string | undefined {
  // Type by the actual bytes, never the extension: a mislabeled file (e.g. a
  // non-image renamed .png) sent as image/png makes the model gateway reject
  // the whole turn, and the malformed part poisons the thread's history.
  const mediaType = detectMediaType({ data: bytes, topLevelType: 'image' });
  return mediaType &&
    ['image/gif', 'image/jpeg', 'image/png', 'image/webp'].includes(mediaType)
    ? mediaType
    : undefined;
}

export const viewImageTool = createTool({
  id: 'view_image',
  description:
    'Look at an image in the sandbox (png, jpeg, gif, webp) so you can actually see it. Pass just the path. This is how you view an image: read_file with an encoding returns text or base64, which you cannot see.',
  inputSchema: z.strictObject({
    path: z.string().min(1).describe('Sandbox path to the image file.'),
  }),
  outputSchema: z.strictObject({
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
  toModelOutput: (out) => ({
    type: 'content',
    value: [
      { type: 'text', text: `${out.path} (${out.mediaType})` },
      { type: 'media', data: out.data, mediaType: out.mediaType },
    ],
  }),
  execute: async ({ path }, context) => {
    const filePath = confinePath({ inputPath: path });
    const sandbox = await requireSandbox(context.requestContext);
    const stat = await sandbox.retryOnDead(() =>
      sandbox.e2b.files.getInfo(filePath)
    );
    if (stat.size > image.maxViewBytes) {
      throw new Error(
        `${path} is ${Math.round(stat.size / 1_000_000)}MB, too large to view inline.`
      );
    }
    const bytes = Buffer.from(
      await sandbox.retryOnDead(() =>
        sandbox.e2b.files.read(filePath, { format: 'bytes' })
      )
    );
    const mediaType = viewableImageType(bytes);
    if (!mediaType) {
      throw new Error(
        `${path} is not a viewable image (png, jpeg, gif, webp). Use read_file for other files.`
      );
    }
    return {
      path,
      mediaType,
      data: bytes.toString('base64'),
    };
  },
});
