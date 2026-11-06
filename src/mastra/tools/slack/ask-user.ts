import { createTool } from '@mastra/core/tools';
import { Chat } from 'chat';
import { z } from 'zod';
import { askActionIds, askCard } from '../../chat/ask-user';
import { channelContext } from '../../lib/context';

export const askUserTool = createTool({
  id: 'ask_user',
  description: `Ask the person who started this turn a multiple choice question in the current conversation. It posts the question with one button per option and returns at once; only that person can answer.

Calling it ends your turn, the same as skip and wait. Do not write anything after it and do not guess the answer: when they click, you are woken in this thread with their choice and continue from there.

Use it only for a real decision that changes what you do next, between two to four distinct options, such as which of several approaches to take before a long or costly job. Never use it for trivial confirmations ("should I go ahead?"), for questions with an obvious default, or when a free text answer is needed; ask those in your normal reply instead. Only single select is supported.`,
  inputSchema: z.strictObject({
    question: z.string().min(1).max(500),
    options: z
      .array(
        z.strictObject({
          label: z
            .string()
            .min(1)
            .max(75)
            .describe('Short button text, 1 to 5 words.'),
          description: z
            .string()
            .min(1)
            .max(300)
            .optional()
            .describe('What choosing this option means.'),
        })
      )
      .min(2)
      .max(askActionIds.length)
      .refine(
        (options) =>
          new Set(options.map(({ label }) => label)).size === options.length,
        'Option labels must be unique.'
      ),
    selectionMode: z
      .literal('single_select')
      .optional()
      .describe('Only single select is supported.'),
  }),
  outputSchema: z.strictObject({ messageId: z.string(), asked: z.boolean() }),
  transform: {
    display: {
      output: ({ input }) => ({
        summary: `Asked: ${input?.question ?? 'a question'}`,
      }),
    },
  },
  execute: async ({ question, options }, context) => {
    const { threadId, userId } = channelContext(context.requestContext);
    const thread = context.agent?.threadId;
    const resource = context.agent?.resourceId;
    if (!(threadId && userId && thread && resource)) {
      throw new Error(
        'No current Slack conversation or requester to ask, so ask in your reply instead.'
      );
    }
    const sent = await Chat.getSingleton()
      .thread(threadId)
      .post(
        askCard({
          memory: { resource, thread },
          options,
          question,
          requester: userId,
        })
      );
    return { messageId: sent.id, asked: true };
  },
});
