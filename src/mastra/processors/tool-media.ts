import type { CompatRule } from '@mastra/core/processors';

interface MediaPart {
  data: string;
  mediaType: string;
  type: 'media';
}

/**
 * Every gateway Gorkie routes through (`gateways()`/`opencode()` in
 * `providers.ts`) is OpenAI-compatible, and none of those provider
 * implementations understand `media` parts inside tool-result content — they
 * fall back to JSON.stringify-ing the whole part as text, so the model never
 * sees the image. Relocating the image into a synthetic user message works
 * everywhere because user-message `file` parts are handled by every provider.
 *
 * Scoped to `image/*` only: the OpenAI-compatible user-message converter
 * throws `UnsupportedFunctionalityError` for other media types (e.g. PDF),
 * which would crash the turn instead of merely not working.
 */
export const relocateToolResultImages: CompatRule = {
  name: 'relocate-tool-result-images',
  applyToPrompt({ prompt }) {
    let changed = false;
    const next: typeof prompt = [];

    for (const message of prompt) {
      if (message.role !== 'tool') {
        next.push(message);
        continue;
      }

      const images: MediaPart[] = [];
      const content = message.content.map((part) => {
        if (part.type !== 'tool-result' || part.output.type !== 'content') {
          return part;
        }
        const kept = part.output.value.filter((item) => {
          if (item.type === 'media' && item.mediaType.startsWith('image/')) {
            images.push(item);
            return false;
          }
          return true;
        });
        if (kept.length === part.output.value.length) {
          return part;
        }
        if (kept.length === 0) {
          kept.push({
            type: 'text',
            text: 'Image attached in the following message.',
          });
        }
        return { ...part, output: { ...part.output, value: kept } };
      });

      if (images.length === 0) {
        next.push(message);
        continue;
      }

      changed = true;
      next.push({ ...message, content });
      next.push({
        role: 'user',
        content: [
          { type: 'text', text: 'Attached media from tool result:' },
          ...images.map((image) => ({
            type: 'file' as const,
            data: image.data,
            mediaType: image.mediaType,
          })),
        ],
      });
    }

    return changed ? next : undefined;
  },
};
