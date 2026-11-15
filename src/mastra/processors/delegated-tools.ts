import type { Processor } from '@mastra/core/processors';
import { z } from 'zod';

const delegatedToolChunk = z.looseObject({
  payload: z.looseObject({
    toolCallId: z.string(),
    toolName: z.string(),
  }),
  type: z.enum(['tool-call', 'tool-result', 'tool-error']),
});

export const delegatedTools = {
  id: 'delegated-tools',
  name: 'Delegated Tool Output',
  description: 'Keeps delegated tool cards distinct in transcripts.',
  processOutputStream({ part }) {
    if (part.type !== 'tool-output') {
      return Promise.resolve(part);
    }

    const { output } = part.payload;
    const delegatedTool = delegatedToolChunk.safeParse(output);
    if (!delegatedTool.success) {
      return Promise.resolve(part);
    }

    return Promise.resolve({
      ...output,
      metadata: {
        ...output.metadata,
        gorkieDelegation: {
          toolCallId: part.payload.toolCallId,
          toolName: part.payload.toolName ?? 'agent',
        },
      },
      payload: {
        ...output.payload,
        toolCallId: `${part.payload.toolCallId}::${delegatedTool.data.payload.toolCallId}`,
        toolName: `${part.payload.toolName ?? 'agent'}_${delegatedTool.data.payload.toolName}`,
      },
    });
  },
} satisfies Processor<'delegated-tools'>;
