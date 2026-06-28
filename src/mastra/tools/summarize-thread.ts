import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../chat/slack';
import { channelContext } from '../lib/context';
import { chatChannelId } from '../lib/ids';
import { assertReadableChannel, joinChannel } from './utils';
import { summarizerAgent } from '../agents/summarizer';

export const summarizeThreadTool = createTool({
  id: 'summarize_thread',
  description:
    'Summarize a conversation thread (defaults to the current thread). Delegates to a dedicated summarizer subagent so the long transcript stays out of your context.',
  inputSchema: z.object({
    threadId: z
      .string()
      .optional()
      .describe('Thread to summarize (slack:C...:ts). Defaults to the current thread.'),
    instructions: z.string().optional().describe('Optional focus or format for the summary.'),
  }),
  execute: async ({ threadId, instructions }, context) => {
    const ctx = channelContext(context?.requestContext);
    const target = threadId ?? ctx.threadId;
    if (!target) throw new Error('No thread to summarize.');

    const channelId = chatChannelId(slack.channelIdFromThreadId(target));
    await assertReadableChannel(channelId, ctx.threadId);
    await joinChannel(channelId);

    const result = await slack.fetchMessages(target, { limit: 100, direction: 'backward' });
    if (result.messages.length === 0) {
      return { success: false, message: 'No messages found in the thread.' };
    }

    const transcript = result.messages
      .map((m) => `${m.author.fullName || m.author.userName || 'unknown'}: ${m.text}`)
      .join('\n');

    const prompt = `${instructions ? `${instructions}\n\n` : ''}Summarize this thread clearly and concisely. Preserve decisions, open questions, and action items when present.\n\n${transcript}`;
    const { text } = await summarizerAgent.generate(prompt);

    return {
      success: true,
      messageCount: result.messages.length,
      message: text,
    };
  },
});
