import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { replyInputSchema } from '../types/progress';

export const replyTool = createTool({
  id: 'reply',
  description:
    'Send your answer to the current Slack conversation and end the turn. Use for a final answer, a question, or a blocker the user must see. Call this by itself after work tools finish. Put progress and narration in status_update, not here. Ordinary model text is not delivered to Slack.',
  inputSchema: replyInputSchema,
  outputSchema: z.strictObject({ queued: z.boolean() }),
  transform: { display: { output: () => ({ summary: 'Reply queued' }) } },
  execute: async ({ message }, context) => {
    if (!context.writer) {
      throw new Error('Reply requires the agent output stream.');
    }
    await context.writer.custom({ type: 'data-reply', data: { message } });
    return { queued: true };
  },
});
