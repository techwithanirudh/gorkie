import { createOpenAI } from '@ai-sdk/openai';
import { createTool } from '@mastra/core/tools';
import { generateImage } from 'ai';
import { z } from 'zod';
import { images } from '../providers';
import { resolveE2BSandbox } from '../workspace';
import { p } from '../workspace/path';

const imageModel = createOpenAI({
  apiKey: images.apiKey,
  baseURL: images.url,
}).image(images.id);

export const generateImageTool = createTool({
  id: 'generate_image',
  description:
    'Generate one or more AI images from a prompt and write them into the sandbox downloads/ directory. Use upload_file afterward to send them to Slack (defaults to the current thread; pass target for elsewhere) or process them first (resize, composite, edit) with other sandbox tools.',
  inputSchema: z.object({
    prompt: z
      .string()
      .min(1)
      .max(1500)
      .describe('What to generate, with the visual details.'),
    n: z
      .number()
      .int()
      .min(1)
      .max(4)
      .default(1)
      .describe('How many images to generate.'),
    aspectRatio: z
      .custom<`${number}:${number}`>(
        (value) => typeof value === 'string' && /^\d+:\d+$/.test(value)
      )
      .optional()
      .describe('Optional aspect ratio like 16:9 or 1:1.'),
  }),
  execute: async ({ prompt, n, aspectRatio }, context) => {
    if (!context?.requestContext) {
      throw new Error('No workspace context.');
    }
    const sandbox = await resolveE2BSandbox(context.requestContext);
    if (!sandbox) {
      throw new Error('No sandbox available.');
    }

    const result = await generateImage({
      model: imageModel,
      prompt,
      n,
      ...(aspectRatio ? { aspectRatio } : {}),
    });
    const total = result.images.length;

    await sandbox.ensureRunning();
    const dir = p('downloads');
    await sandbox.retryOnDead(() => sandbox.e2b.files.makeDir(dir));

    const batch =
      context.agent?.toolCallId.replace(/[^\w-]/g, '').slice(-8) ||
      Date.now().toString(36);
    const paths = await Promise.all(
      result.images.map(async (image, index) => {
        const ext = image.mediaType.split('/').at(1) ?? 'png';
        const path = p(
          'downloads',
          `gorkie-image-${batch}-${index + 1}.${ext}`
        );
        const buffer = Buffer.from(image.uint8Array);
        await sandbox.retryOnDead(() =>
          sandbox.e2b.files.write(
            path,
            buffer.buffer.slice(
              buffer.byteOffset,
              buffer.byteOffset + buffer.byteLength
            )
          )
        );
        return path;
      })
    );

    return {
      success: true,
      prompt,
      paths,
      message: `Generated ${total} image${total === 1 ? '' : 's'} into the sandbox: ${paths.join(', ')}. Use upload_file to send them to Slack.`,
    };
  },
});
