import { createTool } from '@mastra/core/tools';
import { generateImage } from 'ai';
import { z } from 'zod';
import { hackclub, images } from '../../providers';
import { input, output } from '../../types/tools/index';
import { getSandbox, sandboxPath as p } from '../../workspace';
import { editImages } from './edit';

export const generateImageTool = createTool({
  id: 'generate_image',
  description:
    'Generate or edit AI images. With just a prompt it generates from scratch. Pass referenceImages (sandbox file paths to existing images) to edit them instead: change something, add something, restyle, or combine several. Write results into the sandbox downloads/ directory. Use upload_file afterward to send them to Slack (defaults to the current thread; pass target for elsewhere) or process them first (resize, composite, edit) with other sandbox tools.',
  inputSchema: input({
    prompt: z
      .string()
      .min(1)
      .max(1500)
      .describe('What to generate, or how to edit the reference images.'),
    n: z
      .number()
      .int()
      .min(1)
      .max(4)
      .default(1)
      .describe(
        'How many images to generate. Ignored when referenceImages is set.'
      ),
    referenceImages: z
      .array(z.string())
      .max(4)
      .optional()
      .describe(
        'Sandbox paths of existing images to edit or combine instead of generating from scratch.'
      ),
  }),
  outputSchema: output({
    prompt: z.string(),
    paths: z.array(z.string()),
  }),
  transform: {
    display: {
      output: ({ output: out }) => ({
        summary: `Generated ${out?.paths.length ?? 0} image${out?.paths.length === 1 ? '' : 's'}`,
      }),
    },
  },
  execute: async ({ prompt, n, referenceImages }, context) => {
    if (!context?.requestContext) {
      throw new Error('No workspace context.');
    }
    const sandbox = await getSandbox(context.requestContext);
    if (!sandbox) {
      throw new Error('No sandbox available.');
    }
    await sandbox.ensureRunning();

    const generated =
      referenceImages && referenceImages.length > 0
        ? await editImages({ prompt, referenceImages, sandbox })
        : (
            await generateImage({
              model: hackclub.imageModel(images.model),
              prompt,
              n,
            })
          ).images.map((image) => ({
            data: Buffer.from(image.uint8Array),
            mediaType: image.mediaType,
          }));

    const dir = p('downloads');
    await sandbox.retryOnDead(() => sandbox.e2b.files.makeDir(dir));

    const batch =
      context.agent?.toolCallId.replace(/[^\w-]/g, '').slice(-8) ||
      Date.now().toString(36);
    const paths = await Promise.all(
      generated.map(async ({ data, mediaType }, index) => {
        const ext = mediaType.split('/').at(1) ?? 'png';
        const path = p(
          'downloads',
          `gorkie-image-${batch}-${index + 1}.${ext}`
        );
        await sandbox.retryOnDead(() =>
          sandbox.e2b.files.write(path, new Uint8Array(data).buffer)
        );
        return path;
      })
    );

    return { prompt, paths };
  },
});
