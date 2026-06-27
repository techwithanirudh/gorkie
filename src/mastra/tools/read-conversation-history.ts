import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { Message } from 'chat';
import { slack } from '../channels/slack';
import { chatChannelId } from './slack-context';
import { channelContext } from '../types';

function formatMessage(message: Message) {
  return {
    id: message.id,
    author:
      message.author.fullName ||
      message.author.userName ||
      message.author.userId ||
      'unknown',
    userId: message.author.userId,
    text: message.text,
    dateSent: message.metadata.dateSent?.toISOString(),
  };
}

export const readConversationHistoryTool = createTool({
  id: 'read_conversation_history',
  description:
    'Read recent messages from the current thread, another thread, or a channel. The current conversation always works; other channels must be public.',
  inputSchema: z.object({
    threadId: z
      .string()
      .optional()
      .describe('Chat SDK thread id (slack:C...:ts). Defaults to the current thread.'),
    channelId: z
      .string()
      .optional()
      .describe('Read channel-level history instead of a thread.'),
    limit: z.number().int().min(1).max(100).default(30),
  }),
  execute: async ({ threadId, channelId, limit }, context) => {
    if (channelId) {
      const result = await slack.fetchChannelMessages(chatChannelId(channelId), {
        limit,
      });
      return { messages: result.messages.map(formatMessage), nextCursor: result.nextCursor };
    }
    const tid = threadId ?? channelContext(context?.requestContext).threadId;
    if (!tid) {
      throw new Error('No thread to read. Pass threadId or channelId.');
    }
    const result = await slack.fetchMessages(tid, { limit });
    return { messages: result.messages.map(formatMessage), nextCursor: result.nextCursor };
  },
});
