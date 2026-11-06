import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { statusUpdateInputSchema } from '../types/tools/index';

export const statusUpdateTool = createTool({
  id: 'status_update',
  description:
    'Name the current work phase in Slack. Tool activity groups underneath it automatically. Call this first before your first work tool, in the same response, to name the work. Use it again only when work moves to a new phase. Reuse a phase while doing several related calls. Skip this for answers without work tools and silent or reaction-only turns. Use reply for the final answer, a question or a blocker. This tool accepts only status; descriptions belong to work tools. Never call this as a step of its own.',
  inputSchema: statusUpdateInputSchema,
  outputSchema: z.strictObject({ ok: z.boolean() }),
  transform: { display: { output: () => ({ summary: 'Progress updated' }) } },
  execute: () => Promise.resolve({ ok: true }),
});
