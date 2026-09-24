import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { logger } from '../lib/logger';

export const skipTool = createTool({
  id: 'skip',
  description:
    'End this turn quietly without sending a Slack reply or reaction. Use for spam, repeated gibberish, low-value messages, events that do not warrant a response, and messages addressed to another person or agent that only mention you. Do not use when someone asked you a question or expects an explanation from you.',
  inputSchema: z.strictObject({
    reason: z
      .string()
      .optional()
      .describe('Why this message does not need a reply.'),
  }),
  outputSchema: z.strictObject({ skipped: z.boolean() }),
  execute: ({ reason }, context) => {
    logger.info('[orchestrator] skipped turn', {
      reason,
      threadId: context.agent?.threadId,
    });
    return Promise.resolve({ skipped: true });
  },
});
