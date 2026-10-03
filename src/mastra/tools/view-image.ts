import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { image } from '../config';
import { formatBytes, viewableImageType } from '../lib/media';
import { requireSandbox } from '../workspace';
import { confinePath } from '../workspace/filesystem';

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
        `${path} is ${formatBytes(stat.size)}, too large to view inline (limit ${formatBytes(image.maxViewBytes)}).`
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
