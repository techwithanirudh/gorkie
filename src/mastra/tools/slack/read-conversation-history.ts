import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { chatChannelId } from '../../lib/ids';
import { spendSlackCall } from '../../lib/slack-budget';
import { input, output, slackMessageSchema } from '../../types/tools/index';
import {
  assertReadableChannel,
  formatMessage,
  joinChannel,
  slackThreadId,
} from './utils';

export const readConversationHistoryTool = createTool({
  id: 'read_conversation_history',
  description:
    'Read one chronological page of raw messages from a Slack channel or thread when exact wording matters. This does not search or filter message text. Use search_slack for one keyword query, Slack code mode for query-driven or exhaustive conversation analysis, and summarize_thread when a long thread only needs a summary. The current conversation is always readable; other channels must be public, and public channels are joined automatically.',
  inputSchema: input({
    channelId: z
      .string()
      .optional()
      .describe(
        'Conversation id (slack:C..., slack:D..., or slack:G...) to read conversation-level history. Omit for the current conversation. Never derive this from a user id.'
      ),
    threadId: z
      .string()
      .optional()
      .describe(
        'Thread id (slack:<conversation-id>:ts), Slack message permalink, or message timestamp paired with channelId. Omit for the current conversation.'
      ),
    limit: z.coerce.number().int().min(1).max(200).default(40),
    cursor: z
      .string()
      .optional()
      .describe('Slack pagination cursor from a previous response.'),
  }),
  outputSchema: output({
    channelId: z.string(),
    messages: z.array(slackMessageSchema),
    nextCursor: z.string().optional(),
  }),
  transform: {
    display: {
      output: ({ input, output }) => ({
        summary: `Read ${output?.messages.length ?? 0} messages from ${input?.threadId ?? input?.channelId ?? output?.channelId ?? 'the current conversation'}`,
      }),
    },
  },
  execute: async ({ channelId, threadId, limit, cursor }, context) => {
    const ctx = channelContext(context?.requestContext);
    const suppliedThreadId = threadId ?? (channelId ? undefined : ctx.threadId);
    const tid = suppliedThreadId
      ? slackThreadId({ channelId, threadId: suppliedThreadId })
      : undefined;
    const resolvedChannelId =
      channelId ?? (tid ? slack.decodeThreadId(tid).channel : undefined);
    if (!resolvedChannelId) {
      throw new Error('Pass channelId or threadId, or run inside a thread.');
    }

    const chId = chatChannelId(resolvedChannelId);
    await assertReadableChannel({
      channelId: chId,
      currentThreadId: ctx.threadId,
    });
    await joinChannel(chId);

    spendSlackCall(context?.requestContext);

    const result = tid
      ? await slack.fetchMessages(tid, { limit, cursor })
      : await slack.fetchChannelMessages(chId, { limit, cursor });

    return {
      channelId: chId,
      messages: result.messages.map(formatMessage),
      nextCursor: result.nextCursor,
    };
  },
});
