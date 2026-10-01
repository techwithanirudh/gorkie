import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { parseSlackInput } from '../../lib/ids';
import { spendSlackCall } from '../../lib/slack-budget';
import { slackMessageSchema } from '../../types/tools/index';
import { openReadableChannel } from './access';
import { formatMessage } from './message';

export const listThreadsTool = createTool({
  id: 'list_threads',
  description:
    'List recent threads in a Slack channel. The current conversation is always readable; other channels must be public, and public channels are joined automatically. Defaults to the current channel.',
  inputSchema: z.strictObject({
    channelId: z
      .string()
      .optional()
      .describe(
        'Conversation id (slack:C..., slack:D..., or slack:G...); defaults to the current conversation.'
      ),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
  }),
  outputSchema: z.strictObject({
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
    spendSlackCall(context.requestContext);
    const ctx = channelContext(context.requestContext);
    const { channel } = parseSlackInput(channelId ?? ctx.channelId);
    if (!channel) {
      throw new Error('No channel to list threads from.');
    }
    await openReadableChannel({ channelId: channel, ctx });

    const conversation = slack.channelIdFromThreadId(
      slack.encodeThreadId({ channel, threadTs: '' })
    );
    const result = await slack.listThreads(conversation, { limit, cursor });
    return {
      channelId: conversation,
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
