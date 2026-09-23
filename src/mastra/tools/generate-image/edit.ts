import { detectMediaType } from '@ai-sdk/provider-utils';
import type { E2BSandbox } from '@mastra/e2b';
import { z } from 'zod';
import { env } from '@/env';
import { images } from '../../providers';

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

export async function editImages({
  prompt,
  referenceImages,
  sandbox,
}: {
  prompt: string;
  referenceImages: string[];
  sandbox: E2BSandbox;
}): Promise<{ data: Buffer; mediaType: string }[]> {
  const references = await Promise.all(
    referenceImages.map(async (path) => {
      const { size } = await sandbox.retryOnDead(() =>
        sandbox.e2b.files.getInfo(path)
      );
      if (size > 8 * 1024 * 1024) {
        throw new Error(
          `"${path}" is ${Math.round(size / 1024 / 1024)}MB, too large to send for editing. Resize it below 8MB first.`
        );
      }
      const data = Buffer.from(
        await sandbox.retryOnDead(() =>
          sandbox.e2b.files.read(path, { format: 'bytes' })
        )
      );
      return {
        data,
        mediaType:
          detectMediaType({ data, topLevelType: 'image' }) ?? 'image/png',
      };
    })
  );

  const response = await fetch(`${images.baseURL}/chat/completions`, {
    method: 'POST',
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
    // The status alone still makes a useful error if the body is unreadable.
    const body = await response.text().catch(() => '');
    throw new Error(
      `Image editing failed (${response.status}): ${body.slice(0, 300)}`
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
