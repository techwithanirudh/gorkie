import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const skipTool = createTool({
  id: 'skip',
  description:
    'End the turn without replying. Use when the message needs no response from you, for example when it is not addressed to you, is a side conversation between other people, or someone is showing your output to a third party. Prefer this over writing a bracketed status note or a filler acknowledgement.',
  inputSchema: z.object({
    reason: z
      .string()
      .optional()
      .describe('Optional short reason for skipping.'),
  }),
  execute: async () => ({
    success: true,
    message: 'Skipped',
  }),
});
