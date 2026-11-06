import type { MemoryStorage } from '@mastra/core/storage';
import { z } from 'zod';

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
        const result = {
          ...z
            .object({ path: z.string(), mediaType: z.string() })
            .parse(part.toolInvocation.result),
          note: 'Image bytes were excluded from saved history; call view_image again to inspect it.',
        };
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
          ? {
              ...call,
              result: z
                .object({ path: z.string(), mediaType: z.string() })
                .parse(call.result),
            }
          : call
      ),
    },
  }));
}
