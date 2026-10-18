import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { chatChannelId } from '../../lib/ids';
import { spendSlackCall } from '../../lib/slack-budget';
import { input, output, slackMessageSchema } from '../../types/tools/index';
import { assertReadableChannel, formatMessage, joinChannel } from './utils';

export const listThreadsTool = createTool({
  id: 'list_threads',
  description:
    'List recent threads in a Slack channel. The current conversation is always readable; other channels must be public, and public channels are joined automatically. Defaults to the current channel.',
  inputSchema: input({
    channelId: z
      .string()
      .optional()
      .describe(
        'Conversation id (slack:C..., slack:D..., or slack:G...); defaults to the current conversation.'
      ),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
  }),
  outputSchema: output({
    channelId: z.string(),
    threads: z.array(
      z.strictObject({
        id: z.string(),
        replyCount: z.number().optional(),
        lastReplyAt: z.string().optional(),
        rootMessage: slackMessageSchema,
      })
    ),
    nextCursor: z.string().optional(),
  }),
  transform: {
    display: {
      output: ({ input, output }) => ({
        summary: `Found ${output?.threads.length ?? 0} threads in ${input?.channelId ?? output?.channelId ?? 'the current channel'}`,
      }),
    },
  },
  execute: async ({ channelId, limit, cursor }, context) => {
    spendSlackCall(context?.requestContext);
    const ctx = channelContext(context?.requestContext);
    const id = channelId ?? ctx.channelId;
    if (!id) {
      throw new Error('No channel to list threads from.');
    }

    const chId = chatChannelId(id);
    await assertReadableChannel({
      channelId: chId,
      currentThreadId: ctx.threadId,
    });
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
