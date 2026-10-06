import { detectMediaType } from '@ai-sdk/provider-utils';
import type { E2BSandbox } from '@mastra/e2b';
import { z } from 'zod';
import { env } from '@/env';
import { image } from '../../config';
import { formatBytes, viewableImageType } from '../../lib/media';
import { images } from '../../providers';
import { E2BFilesystem } from '../../workspace/filesystem';

const completionSchema = z.looseObject({
  choices: z
    .array(
      z.looseObject({
        message: z
          .looseObject({
            content: z.string().nullish(),
            images: z
              .array(
                z.looseObject({
                  image_url: z.looseObject({ url: z.string() }).optional(),
                })
              )
              .optional(),
          })
          .optional(),
      })
    )
    .optional(),
});

// Generation and editing both go through chat completions. The OpenRouter
// provider's imageModel posts to `/images`, a route the Hack Club proxy does
// not serve: it answers 404 for every model id.
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
  const response = await fetch(`${images.baseURL}/chat/completions`, {
    method: 'POST',
    signal: abortSignal ? AbortSignal.any([abortSignal, timeout]) : timeout,
    headers: {
      Authorization: `Bearer ${env.HACKCLUB_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: images.model,
      modalities: ['image', 'text'],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...references.map((ref) => ({
              type: 'image_url',
              image_url: {
                url: `data:${ref.mediaType};base64,${ref.data.toString('base64')}`,
              },
            })),
          ],
        },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    if (response.status === 429 && body.includes('spending limit')) {
      throw new Error(
        'Hack Club image generation is blocked by its upstream spending limit. Do not retry or wait and retry. Tell the user the provider needs its spending limit restored before image generation can work.'
      );
    }
    if (response.status === 404 || body.includes('not a valid model ID')) {
      throw new Error(
        `Image model unavailable (${response.status} for "${images.model}"). Do not retry, and do not wait and retry. Tell the user image generation is currently down.`
      );
    }
    throw new Error(
      `Image generation failed (${response.status}): ${body.slice(0, 300)}`
    );
  }
  const message = completionSchema
    .parse(await response.json())
    .choices?.at(0)?.message;
  const out = (message?.images ?? []).flatMap((entry) => {
    const match = /^data:([^;,]+);base64,(.+)$/s.exec(
      entry.image_url?.url ?? ''
    );
    if (!match) {
      return [];
    }
    const data = Buffer.from(match[2], 'base64');
    return [
      {
        data,
        mediaType: detectMediaType({ data, topLevelType: 'image' }) ?? match[1],
      },
    ];
  });
  if (out.length === 0) {
    throw new Error(
      `The image model returned no image${message?.content ? `. It said: ${message.content.slice(0, 300)}` : '.'}`
    );
  }
  return out;
}
