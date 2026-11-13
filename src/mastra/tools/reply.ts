import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { chat } from '../chat/instance';
import { neutralizeBroadcasts } from '../chat/message';
import { replyCard } from '../chat/reply-card';
import { ReplyDraft, replyDrafts } from '../chat/reply-draft';
import { channelContext } from '../lib/context';
import { replyInputSchema } from '../types/progress';

const markdownTable = /^\s*\|.*\|\s*\n\s*\|[\s:|-]+\|\s*$/m;

export const replyTool = createTool({
  id: 'reply',
  description:
    'Send your answer to the current Slack conversation and end the turn. Use for a final answer, a question, or a blocker. Before sending, ask whether the answer has numbers to compare, items with the same attributes, a few key stats, or an obvious next step. If so, add a card: a Chart, Table, Fields or Buttons, with Text between them.',
  inputSchema: replyInputSchema,
  outputSchema: z.strictObject({ sent: z.boolean() }),
  transform: { display: { output: () => ({ summary: 'Reply sent' }) } },
  execute: async ({ message, card }, context) => {
    if (markdownTable.test(message)) {
      throw new Error(
        'Slack cannot show a markdown table. Move it into card as a Table element and keep the takeaway in message.'
      );
    }
    const element = card && replyCard(card);
    const { threadId } = channelContext(context.requestContext);
    if (!threadId) {
      return { sent: false };
    }
    const draft =
      replyDrafts.get(threadId) ?? new ReplyDraft(chat().thread(threadId));
    replyDrafts.set(threadId, draft);
    // A step can call reply twice in parallel, and only one is the answer.
    if (draft.finished) {
      return { sent: false };
    }
    draft.finished = true;
    try {
      await draft.finish({
        answer: neutralizeBroadcasts(message),
        card: element,
      });
    } catch (error) {
      draft.finished = false;
      throw error;
    }
    return { sent: true };
  },
});
