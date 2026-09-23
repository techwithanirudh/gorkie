import { detectMediaType } from '@ai-sdk/provider-utils';
import type { E2BSandbox } from '@mastra/e2b';
import { env } from '@/env';
import { images } from '../../providers';

const DATA_URI = /^data:([^;,]+);base64,(.+)$/s;
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;

async function readReference({
  path,
  sandbox,
}: {
  path: string;
  sandbox: E2BSandbox;
}): Promise<{ data: Buffer; mediaType: string }> {
  const bytes = Buffer.from(
    await sandbox.retryOnDead(() =>
      sandbox.e2b.files.read(path, { format: 'bytes' })
    )
  );
  if (bytes.byteLength > MAX_REFERENCE_BYTES) {
    throw new Error(
      `"${path}" is ${Math.round(bytes.byteLength / 1024 / 1024)}MB, too large to send for editing. Resize it below 8MB first.`
    );
  }
  return {
    data: bytes,
    mediaType:
      detectMediaType({ data: bytes, topLevelType: 'image' }) ?? 'image/png',
  };
}

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
    referenceImages.map((path) => readReference({ path, sandbox }))
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
    const body = await response.text().catch(() => '');
    throw new Error(
      `Image editing failed (${response.status}): ${body.slice(0, 300)}`
    );
  }
  const payload = (await response.json()) as {
    choices?: {
      message?: {
        content?: string;
        images?: { image_url?: { url?: string } }[];
      };
    }[];
  };
  const message = payload.choices?.at(0)?.message;
  const out: { data: Buffer; mediaType: string }[] = [];
  for (const entry of message?.images ?? []) {
    const match = DATA_URI.exec(entry.image_url?.url ?? '');
    if (match) {
      const data = Buffer.from(match[2], 'base64');
      out.push({
        data,
        mediaType: detectMediaType({ data, topLevelType: 'image' }) ?? match[1],
      });
    }
  }
  if (out.length === 0) {
    throw new Error(
      `The image model returned no image${message?.content ? `. It said: ${message.content.slice(0, 300)}` : '.'}`
    );
  }
  return out;
}
