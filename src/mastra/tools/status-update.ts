import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { statusUpdateInputSchema } from '../types/tools/index';

export const statusUpdateTool = createTool({
  id: 'status_update',
  description:
    'Name the current work phase in Slack. Tool activity groups underneath it automatically. Every turn starts with this call, so name what you are about to do. Use it again only when work moves to a new phase, in the same response as the first tool of that phase. Reuse a phase while doing several related calls. Use reply for the final answer, a question or a blocker. This tool accepts only status; descriptions belong to work tools.',
  inputSchema: statusUpdateInputSchema,
  outputSchema: z.strictObject({ ok: z.boolean() }),
  transform: { display: { output: () => ({ summary: 'Progress updated' }) } },
  execute: () => Promise.resolve({ ok: true }),
});
