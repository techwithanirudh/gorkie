import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../channels/slack';
import { chatChannelId } from './slack-context';
import { channelContext } from '../types';

export const listThreadsTool = createTool({
  id: 'list_threads',
  description:
    'List recent threads in a channel (root message + reply count) to find a thread id before reading it. Defaults to the current channel.',
  inputSchema: z.object({
    channelId: z
      .string()
      .optional()
      .describe('Channel id; defaults to the current channel.'),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  execute: async ({ channelId, limit }, context) => {
    const id = channelId ?? channelContext(context?.requestContext).channelId;
    if (!id) throw new Error('No channel to list threads from.');
    const result = await slack.listThreads(chatChannelId(id), { limit });
    return {
      threads: result.threads.map((t) => ({
        id: t.id,
        rootText: t.rootMessage.text,
        author:
          t.rootMessage.author.fullName ||
          t.rootMessage.author.userName ||
          t.rootMessage.author.userId ||
          'unknown',
        replyCount: t.replyCount,
        lastReplyAt: t.lastReplyAt?.toISOString(),
      })),
      nextCursor: result.nextCursor,
    };
  },
});
