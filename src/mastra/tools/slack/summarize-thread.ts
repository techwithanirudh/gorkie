import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { summarizer } from '../../agents/summarizer';
import { slack } from '../../chat/client';
import { isComment } from '../../chat/message';
import { channelContext } from '../../lib/context';
import { chatChannelId } from '../../lib/ids';
import { spendSlackCall } from '../../lib/slack-budget';
import {
  assertReadableChannel,
  focusedMessages,
  joinChannel,
  slackThreadId,
} from './utils';

export const summarizeThreadTool = createTool({
  id: 'summarize_thread',
  description:
    'Summarize up to 100 messages from one Slack thread without returning its full transcript to the caller. Defaults to the current thread. The current conversation is always readable; other threads must be in a public channel, which is joined automatically. Messages starting with ## are side comments and are left out. Use read_conversation_history when exact wording or message metadata matters, and Slack code mode for exhaustive or cross-thread analysis.',
  inputSchema: z.strictObject({
    threadId: z
      .string()
      .optional()
      .describe(
        'Thread to summarize (slack:<conversation-id>:ts) or a Slack message permalink. Defaults to the current thread.'
      ),
    instructions: z
      .string()
      .optional()
      .describe('Optional focus or format for the summary.'),
  }),
  outputSchema: z.strictObject({
    messageCount: z.number().int().min(1),
    summary: z.string(),
  }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: `Summarized ${output?.messageCount ?? 0} messages`,
      }),
    },
  },
  execute: async ({ threadId, instructions }, context) => {
    const ctx = channelContext(context.requestContext);
    const suppliedThreadId = threadId ?? ctx.threadId;
    if (!suppliedThreadId) {
      throw new Error('No thread to summarize.');
    }
    const target = slackThreadId({ threadId: suppliedThreadId });

    const channelId = chatChannelId(slack.channelIdFromThreadId(target));
    await assertReadableChannel({ channelId, currentThreadId: ctx.threadId });
    await joinChannel(channelId);

    spendSlackCall(context.requestContext);

    const result = await slack.fetchMessages(target, {
      limit: 100,
      direction: 'backward',
    });
    const messages = (
      await focusedMessages({
        currentThreadId: ctx.threadId,
        messages: result.messages,
        threadId: target,
      })
    ).filter((message) => !isComment(message));
    if (messages.length === 0) {
      throw new Error('No messages found in the thread.');
    }

    const lines = messages.map((message, index) => {
      const author =
        message.author.fullName ||
        message.author.userName ||
        message.author.userId;
      const attachments = message.attachments
        .map(
          (attachment) =>
            `[attachment: ${attachment.name ?? attachment.type}${attachment.url ? `, ${attachment.url}` : ''}]`
        )
        .join(' ');
      return `${index + 1}. [${message.metadata.dateSent.toISOString()}] ${author} (${message.author.userId}): ${message.text}${attachments ? ` ${attachments}` : ''}`;
    });
    const transcript = lines.join('\n');

    const prompt = `${instructions ? `Focus requested by the user: ${instructions}\n\n` : ''}<transcript>\n${transcript}\n</transcript>`;
    const { text } = await summarizer.generate(prompt, {
      requestContext: context.requestContext,
      tracingContext: context.tracingContext,
    });

    return {
      messageCount: messages.length,
      summary: text,
    };
  },
});
