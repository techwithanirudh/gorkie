import type { CompatRule } from '@mastra/core/processors';
import { image as imageLimits } from '../config';
import {
  attachedMediaNote,
  imageAttachedNote,
  imageOmittedNote,
} from '../prompts/processors';

type Prompt = Parameters<NonNullable<CompatRule['applyToPrompt']>>[0]['prompt'];
type FilePart = Extract<
  Extract<Prompt[number], { role: 'user' }>['content'][number],
  { type: 'file' }
>;
type MediaPart = Extract<
  Extract<
    Extract<
      Extract<Prompt[number], { role: 'tool' }>['content'][number],
      { type: 'tool-result' }
    >['output'],
    { type: 'content' }
  >['value'][number],
  { type: 'media' }
>;

function decodedBytes(data: FilePart['data']): number {
  if (data instanceof Uint8Array) {
    return data.byteLength;
  }
  const text = data instanceof URL ? data.href : data;
  // A remote URL is fetched by the provider, so it costs nothing inline here.
  if (/^https?:/i.test(text)) {
    return 0;
  }
  return Math.ceil((text.slice(text.indexOf(',') + 1).length * 3) / 4);
}

type Image = MediaPart | FilePart;
type ToolMessage = Extract<Prompt[number], { role: 'tool' }>;

const isImage = (part: { mediaType: string }) =>
  part.mediaType.startsWith('image/');

function collectImages(prompt: Prompt): {
  found: { part: Image; size: number }[];
  toolImages: number;
} {
  const found: { part: Image; size: number }[] = [];
  let toolImages = 0;
  for (const message of prompt) {
    if (message.role === 'user') {
      for (const part of message.content) {
        if (part.type === 'file' && isImage(part)) {
          found.push({ part, size: decodedBytes(part.data) });
        }
      }
      continue;
    }
    if (message.role !== 'tool') {
      continue;
    }
    for (const part of message.content) {
      if (part.type !== 'tool-result' || part.output.type !== 'content') {
        continue;
      }
      for (const item of part.output.value) {
        if (item.type === 'media' && isImage(item)) {
          found.push({ part: item, size: decodedBytes(item.data) });
          toolImages++;
        }
      }
    }
  }
  return { found, toolImages };
}

// Relocation concentrates every tool image into one request, next to the
// Slack uploads already inline, and vision models cap inline images (GLM:
// 8 / 64 MiB, a non-retryable 400), so keep only the most recent images
// within budget, whichever route they came in by.
function keepWithinBudget(found: { part: Image; size: number }[]): Set<Image> {
  const keep = new Set<Image>();
  let bytes = 0;
  for (let i = found.length - 1; i >= 0; i--) {
    const { part, size } = found[i];
    if (
      keep.size >= imageLimits.maxContextImages ||
      bytes + size > imageLimits.maxContextBytes
    ) {
      break;
    }
    keep.add(part);
    bytes += size;
  }
  return keep;
}

function rewriteToolMessage({
  keep,
  message,
}: {
  keep: Set<Image>;
  message: ToolMessage;
}): Prompt {
  const relocated: MediaPart[] = [];
  const content = message.content.map((part) => {
    if (part.type !== 'tool-result' || part.output.type !== 'content') {
      return part;
    }
    let keptImage = false;
    let droppedImage = false;
    const kept = part.output.value.filter((item) => {
      if (item.type === 'media' && isImage(item)) {
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
        text: imageAttachedNote,
      });
    }
    if (droppedImage) {
      kept.push({ type: 'text', text: imageOmittedNote });
    }
    return { ...part, output: { ...part.output, value: kept } };
  });
  if (relocated.length === 0) {
    return [{ ...message, content }];
  }
  return [
    { ...message, content },
    {
      role: 'user',
      content: [
        { type: 'text', text: attachedMediaNote },
        ...relocated.map(
          (media): FilePart => ({
            type: 'file',
            data: media.data,
            mediaType: media.mediaType,
          })
        ),
      ],
    },
  ];
}

function rewritePrompt({
  keep,
  prompt,
}: {
  keep: Set<Image>;
  prompt: Prompt;
}): Prompt {
  return prompt.flatMap((message): Prompt => {
    if (message.role === 'user') {
      return [
        {
          ...message,
          content: message.content.map((part) =>
            part.type === 'file' && isImage(part) && !keep.has(part)
              ? { type: 'text', text: imageOmittedNote }
              : part
          ),
        },
      ];
    }
    return message.role === 'tool'
      ? rewriteToolMessage({ keep, message })
      : [message];
  });
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
function relocateToolImages({
  prompt,
}: {
  prompt: Prompt;
}): Prompt | undefined {
  const { found, toolImages } = collectImages(prompt);
  const keep = keepWithinBudget(found);
  if (toolImages === 0 && keep.size === found.length) {
    return;
  }
  return rewritePrompt({ keep, prompt });
}

export const moveToolImages: CompatRule = {
  name: 'move-tool-images',
  applyToPrompt: relocateToolImages,
};
