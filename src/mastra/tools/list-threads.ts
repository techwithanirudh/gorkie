import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../chat/slack';
import { channelContext } from '../types';
import { chatChannelId } from './slack-context';
import { assertReadableChannel, joinChannel, formatMessage } from './utils';

export const listThreadsTool = createTool({
  id: 'list_threads',
  description:
    'List recent channel threads so you can pick a thread id before reading it. The current channel always works; other channels must be public. Defaults to the current channel.',
  inputSchema: z.object({
    channelId: z.string().optional().describe('Channel id; defaults to the current channel.'),
    limit: z.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
  }),
  execute: async ({ channelId, limit, cursor }, context) => {
    const ctx = channelContext(context?.requestContext);
    const id = channelId ?? ctx.channelId;
    if (!id) throw new Error('No channel to list threads from.');

    const chId = chatChannelId(id);
    await assertReadableChannel(chId, ctx.threadId);
    await joinChannel(chId);

    const result = await slack.listThreads(chId, { limit, cursor });
    return {
      channelId: chId,
      threads: result.threads.map((thread) => ({
        id: thread.id,
        replyCount: thread.replyCount,
        lastReplyAt: thread.lastReplyAt?.toISOString(),
        rootMessage: formatMessage(thread.rootMessage),
      })),
      nextCursor: result.nextCursor,
    };
  },
});
