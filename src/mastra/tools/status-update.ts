import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { statusUpdateInputSchema } from '../types/tools/index';

export const statusUpdateTool = createTool({
  id: 'status_update',
  description:
    'Always use this to show the person what you are doing while you work: it sets the progress line above your tool cards. Never write messages while working; text beside tool calls is posted into the thread as-is. Write text only for the final answer or a real question or blocker. Call it in the same step as the tool calls it describes, never as a step of its own.',
  inputSchema: statusUpdateInputSchema,
  outputSchema: z.strictObject({ ok: z.boolean() }),
  execute: () => Promise.resolve({ ok: true }),
});
