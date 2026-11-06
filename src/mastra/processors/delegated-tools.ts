import type { Processor } from '@mastra/core/processors';
import { z } from 'zod';
import { activitySchema } from '../types/progress';

const delegatedToolChunk = z.looseObject({
  payload: z.looseObject({
    toolCallId: z.string(),
    toolName: z.string(),
  }),
  type: z.enum(['tool-call', 'tool-result', 'tool-error']),
});

const callIdSeparator = '::';
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
    const activity = z
      .object({
        type: z.literal('data-code-mode-activity'),
        data: activitySchema,
      })
      .safeParse(output);
    if (!(delegatedTool.success || activity.success)) {
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
      ...(delegatedTool.success
        ? {
            payload: {
              ...output.payload,
              toolCallId: `${part.payload.toolCallId}${callIdSeparator}${delegatedTool.data.payload.toolCallId}`,
              toolName: `${part.payload.toolName ?? 'agent'}_${delegatedTool.data.payload.toolName}`,
            },
          }
        : {}),
    });
  },
} satisfies Processor<'delegated-tools'>;
