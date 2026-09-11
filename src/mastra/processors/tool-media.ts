import type { CompatRule } from '@mastra/core/processors';

interface MediaPart {
  data: string;
  mediaType: string;
  type: 'media';
}

export const moveToolImages: CompatRule = {
  name: 'move-tool-images',
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
          ...images.map(
            (image): { type: 'file'; data: string; mediaType: string } => ({
              type: 'file',
              data: image.data,
              mediaType: image.mediaType,
            })
          ),
        ],
      });
    }

    return changed ? next : undefined;
  },
};
