import type { E2BSandbox } from '@mastra/e2b';
import { APICallError, type FilePart, generateText } from 'ai';
import { image } from '../../config';
import { formatBytes, viewableImageType } from '../../lib/media';
import { images } from '../../providers';
import { E2BFilesystem } from '../../workspace/filesystem';

export async function requestImages({
  abortSignal,
  prompt,
  referenceImages,
  sandbox,
}: {
  abortSignal?: AbortSignal;
  prompt: string;
  referenceImages: string[];
  sandbox: E2BSandbox;
}): Promise<{ data: Buffer; mediaType: string }[]> {
  const filesystem = new E2BFilesystem({ sandbox });
  const references = await Promise.all(
    referenceImages.map(async (path) => {
      const filePath = await filesystem.realpath(path);
      const { size } = await sandbox.retryOnDead(() =>
        sandbox.e2b.files.getInfo(filePath)
      );
      if (size > image.maxEditBytes) {
        throw new Error(
          `"${path}" is ${formatBytes(size)}, too large to send for editing. Resize it below ${formatBytes(image.maxEditBytes)} first.`
        );
      }
      const data = Buffer.from(
        await sandbox.retryOnDead(() =>
          sandbox.e2b.files.read(filePath, { format: 'bytes' })
        )
      );
      const mediaType = viewableImageType(data);
      if (!mediaType) {
        throw new Error(
          `"${path}" is not a png, jpeg, gif or webp image, so it cannot be sent for editing.`
        );
      }
      return { data, mediaType };
    })
  );

  const timeout = AbortSignal.timeout(image.requestTimeoutMs);
  try {
    const result = await generateText({
      model: images.model,
      maxRetries: 0,
      abortSignal: abortSignal
        ? AbortSignal.any([abortSignal, timeout])
        : timeout,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...references.map(
              ({ data, mediaType }): FilePart => ({
                type: 'file',
                data,
                mediaType,
              })
            ),
          ],
        },
      ],
    });
    const generated = result.files
      .filter(({ mediaType }) => mediaType.startsWith('image/'))
      .map((file) => ({
        data: Buffer.from(file.uint8Array),
        mediaType: file.mediaType,
      }));
    if (generated.length === 0) {
      throw new Error(
        `The image model returned no image${result.text ? `. It said: ${result.text.slice(0, 300)}` : '.'}`
      );
    }
    return generated;
  } catch (error) {
    if (APICallError.isInstance(error)) {
      if (
        error.statusCode === 429 &&
        error.responseBody?.includes('spending limit')
      ) {
        throw new Error(
          'Hack Club image generation is blocked by its upstream spending limit. Do not retry or wait and retry. Tell the user the provider needs its spending limit restored before image generation can work.',
          { cause: error }
        );
      }
      if (
        error.statusCode === 404 ||
        error.responseBody?.includes('not a valid model ID')
      ) {
        throw new Error(
          `Image model unavailable (${error.statusCode} for "${images.model.modelId}"). Do not retry, and do not wait and retry. Tell the user image generation is currently down.`,
          { cause: error }
        );
      }
    }
    throw error;
  }
}
