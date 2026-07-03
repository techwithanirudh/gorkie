import type { ProcessOutputStreamArgs } from '@mastra/core/processors';
import { z } from 'zod';
import { clip } from '../lib/clip';
import { logger } from '../lib/logger';

const childChunk = z.looseObject({
  type: z.enum(['tool-call', 'tool-result', 'tool-error']),
  payload: z.looseObject({
    toolCallId: z.string(),
    toolName: z.string(),
  }),
});

export const delegates = {
  id: 'delegates',
  processOutputStream({ part }: ProcessOutputStreamArgs) {
    if (part.type !== 'tool-output') {
      return part;
    }
    const output = part.payload.output;
    const child = childChunk.safeParse(output);
    if (!child.success) {
      return part;
    }
    logger.info(`[${child.data.payload.toolName}] ${child.data.type}`, {
      name: part.payload.toolName,
      toolCallId: child.data.payload.toolCallId,
      ...(child.data.type === 'tool-call'
        ? { args: clip(output.payload.args) }
        : {}),
      ...(child.data.type === 'tool-result'
        ? {
            isError: output.payload.isError,
            output: clip(output.payload.result),
          }
        : {}),
      ...(child.data.type === 'tool-error'
        ? { error: clip(output.payload.error) }
        : {}),
    });
    return {
      ...output,
      payload: {
        ...output.payload,
        toolName: `${part.payload.toolName ?? 'agent'}_${child.data.payload.toolName}`,
      },
    };
  },
};
