import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { chat } from '../chat/instance';

export const postMessageTool = createTool({
  id: 'post_message',
  description:
    'Post a markdown message to ANOTHER target (thread, channel, or user). Your streamed reply is the message to the current thread; use this only to message somewhere else.',
  inputSchema: z.object({
    type: z.enum(['thread', 'channel', 'user']).describe('Target kind.'),
    id: z
      .string()
      .min(1)
      .describe('Chat SDK id: thread (slack:C...:ts), channel (slack:C...), or a user id.'),
    message: z.string().min(1).describe('Markdown message body.'),
  }),
  execute: async ({ type, id, message }) => {
    const bot = chat();
    if (type === 'channel') {
      const sent = await bot.channel(id).post({ markdown: message });
      return { success: true, messageId: sent.id, threadId: sent.threadId, message: `Posted to channel ${id}.` };
    }
    const thread = type === 'user' ? await bot.openDM(id) : bot.thread(id);
    const sent = await thread.post({ markdown: message });
    return { success: true, messageId: sent.id, threadId: sent.threadId, message: `Posted to ${type} ${id}.` };
  },
});
