import type { CompatRule } from '@mastra/core/processors';
import { image as imageLimits } from '../config';

interface MediaPart {
  data: string;
  mediaType: string;
  type: 'media';
}

function byteLength(base64: string): number {
  return Math.ceil((base64.length * 3) / 4);
}

// Every gateway gorkie routes through is OpenAI-compatible, and none of them
// understand `media` parts inside tool-result content: they JSON-stringify the
// whole part as text, so the model never sees the image. Relocating it into a
// synthetic user message works everywhere, because user-message `file` parts
// are handled by every provider.
//
// Scoped to `image/*` on purpose. The OpenAI-compatible user-message converter
// branches on `image/*`, `audio/*` and `application/pdf` and throws
// `UnsupportedFunctionalityError` for anything else, which crashes the turn
// rather than merely not working.
export const moveToolImages: CompatRule = {
  name: 'move-tool-images',
  applyToPrompt({ prompt }) {
    const found: MediaPart[] = [];
    for (const message of prompt) {
      if (message.role !== 'tool') {
        continue;
      }
      for (const part of message.content) {
        if (part.type !== 'tool-result' || part.output.type !== 'content') {
          continue;
        }
        for (const item of part.output.value) {
          if (item.type === 'media' && item.mediaType.startsWith('image/')) {
            found.push(item);
          }
        }
      }
    }
    if (found.length === 0) {
      return;
    }

    const keep = new Set<MediaPart>();
    let bytes = 0;
    for (let i = found.length - 1; i >= 0; i--) {
      const media = found[i];
      const size = byteLength(media.data);
      if (
        keep.size >= imageLimits.maxContextImages ||
        bytes + size > imageLimits.maxContextBytes
      ) {
        break;
      }
      keep.add(media);
      bytes += size;
    }
    const next: typeof prompt = [];
    for (const message of prompt) {
      if (message.role !== 'tool') {
        next.push(message);
        continue;
      }
      const relocated: MediaPart[] = [];
      const content = message.content.map((part) => {
        if (part.type !== 'tool-result' || part.output.type !== 'content') {
          return part;
        }
        let keptImage = false;
        let droppedImage = false;
        const kept = part.output.value.filter((item) => {
          if (item.type === 'media' && item.mediaType.startsWith('image/')) {
            if (keep.has(item)) {
              relocated.push(item);
              keptImage = true;
            } else {
              droppedImage = true;
            }
            return false;
          }
          return true;
        });
        if (kept.length === part.output.value.length) {
          return part;
        }
        if (keptImage) {
          kept.push({
            type: 'text',
            text: 'Image attached in the following message.',
          });
        }
        if (droppedImage) {
          kept.push({
            type: 'text',
            text: "Image omitted to stay within the model's image limit. Call view_image on the file again if you still need it.",
          });
        }
        return { ...part, output: { ...part.output, value: kept } };
      });

      next.push({ ...message, content });
      if (relocated.length > 0) {
        next.push({
          role: 'user',
          content: [
            { type: 'text', text: 'Attached media from tool result:' },
            ...relocated.map(
              (media): { type: 'file'; data: string; mediaType: string } => ({
                type: 'file',
                data: media.data,
                mediaType: media.mediaType,
              })
            ),
          ],
        });
      }
    }

    return next;
  },
};
