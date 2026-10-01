import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { isComment } from '../../chat/message';
import { channelContext } from '../../lib/context';
import { parseSlackInput } from '../../lib/ids';
import { spendSlackCall } from '../../lib/slack-budget';
import { slackMessageSchema } from '../../types/tools/index';
import { openReadableChannel } from './access';
import { formatMessage } from './message';

export const readConversationHistoryTool = createTool({
  id: 'read_conversation_history',
  description:
    'Read one chronological page of raw messages from a Slack channel or thread when exact wording matters. Messages starting with ## are side comments and are left out unless includeComments is true; nothing else is filtered. Use search_slack for one keyword query, Slack code mode for query-driven or exhaustive conversation analysis, and summarize_thread when a long thread only needs a summary. Pass the returned cursor back to page through more history. The current conversation is always readable; other channels must be public, and public channels are joined automatically.',
  inputSchema: z.strictObject({
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
    includeComments: z
      .boolean()
      .default(false)
      .describe(
        'Include messages whose first line starts with ##. People use those for side remarks they are not asking you to act on, so they are left out unless you ask for them. The result says so when any were dropped.'
      ),
  }),
  outputSchema: z.strictObject({
    channelId: z.string(),
    messages: z.array(slackMessageSchema),
    nextCursor: z.string().optional(),
    note: z.string().optional(),
  }),
  transform: {
    display: {
      output: ({ input, output }) => ({
        summary: `Read ${output?.messages.length ?? 0} messages from ${input?.threadId ?? input?.channelId ?? output?.channelId ?? 'the current conversation'}`,
      }),
    },
  },
  execute: async (
    { channelId, threadId, limit, cursor, includeComments },
    context
  ) => {
    const ctx = channelContext(context.requestContext);
    const thread = parseSlackInput(
      threadId ?? (channelId ? undefined : ctx.threadId)
    );
    const channel = thread.channel ?? parseSlackInput(channelId).channel;
    if (!channel) {
      throw new Error('Pass channelId or threadId, or run inside a thread.');
    }
    if (threadId && !thread.threadTs) {
      throw new Error(
        `${threadId} is not a thread id (slack:<conversation-id>:ts), message permalink, or message timestamp.`
      );
    }

    await openReadableChannel({ channelId: channel, ctx });
    spendSlackCall(context.requestContext);

    const conversation = slack.encodeThreadId({
      channel,
      threadTs: thread.threadTs ?? '',
    });
    const result = thread.threadTs
      ? await slack.fetchMessages(conversation, { limit, cursor })
      : await slack.fetchChannelMessages(
          slack.channelIdFromThreadId(conversation),
          { limit, cursor }
        );

    const kept = includeComments
      ? result.messages
      : result.messages.filter((message) => !isComment(message));
    const omitted = result.messages.length - kept.length;

    return {
      channelId: slack.channelIdFromThreadId(conversation),
      messages: kept.map(formatMessage),
      nextCursor: result.nextCursor,
      note:
        omitted > 0
          ? `${omitted} ${omitted === 1 ? 'message' : 'messages'} starting with ## were left out of this page. They are side comments nobody addressed to you. Call this again with includeComments: true if you need them.`
          : undefined,
    };
  },
});
