import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { statusUpdateInputSchema } from '../types/tools/index';

export const statusUpdateTool = createTool({
  id: 'status_update',
  description:
    'Show the person a short progress line while you work. It does nothing else. Call it in the same step as the tool calls it describes, never as a step of its own.',
  inputSchema: statusUpdateInputSchema,
  outputSchema: z.strictObject({ ok: z.boolean() }),
  execute: () => Promise.resolve({ ok: true }),
});
