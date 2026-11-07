import type { MemoryStorage } from '@mastra/core/storage';
import { z } from 'zod';

const viewedImage = z.object({ path: z.string(), mediaType: z.string() });

// A rejected or aborted call also lands in state `result`, without those fields
// or any image bytes, so it passes through as it is.
function withoutBytes(result: unknown) {
  const viewed = viewedImage.safeParse(result).data;
  return (
    viewed && {
      ...viewed,
      note: 'Image bytes were excluded from saved history; call view_image again to inspect it.',
    }
  );
}

export function excludeImageData({
  messages,
}: Parameters<MemoryStorage['saveMessages']>[0]) {
  return messages.map((message) => ({
    ...message,
    content: {
      ...message.content,
      parts: message.content.parts.map((part) => {
        if (
          part.type !== 'tool-invocation' ||
          part.toolInvocation.toolName !== 'view_image' ||
          part.toolInvocation.state !== 'result'
        ) {
          return part;
        }
        const result = withoutBytes(part.toolInvocation.result);
        if (!result) {
          return part;
        }
        const { modelOutput: _modelOutput, ...mastra } =
          part.providerMetadata?.mastra ?? {};
        return {
          ...part,
          toolInvocation: { ...part.toolInvocation, result },
          providerMetadata: { ...part.providerMetadata, mastra },
        };
      }),
      toolInvocations: message.content.toolInvocations?.map((call) =>
        call.toolName === 'view_image' && call.state === 'result'
          ? { ...call, result: withoutBytes(call.result) ?? call.result }
          : call
      ),
    },
  }));
}
