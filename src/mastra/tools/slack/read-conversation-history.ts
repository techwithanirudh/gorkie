import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { chatChannelId } from '../../lib/ids';
import { assertReadableChannel, formatMessage, joinChannel } from './utils';

export const readConversationHistoryTool = createTool({
  id: 'read_conversation_history',
  description:
    'Read channel history or thread replies. The current conversation is always readable; other channels must be public.',
  inputSchema: z.object({
    channelId: z.string().optional().describe('Read channel-level history.'),
    threadId: z
      .string()
      .optional()
      .describe(
        'Chat SDK thread id (slack:C...:ts). Defaults to the current thread.'
      ),
    limit: z.number().int().min(1).max(200).default(40),
    cursor: z
      .string()
      .optional()
      .describe('Slack pagination cursor from a previous response.'),
  }),
  execute: async ({ channelId, threadId, limit, cursor }, context) => {
    const ctx = channelContext(context?.requestContext);
    const tid = threadId ?? (channelId ? undefined : ctx.threadId);
    const resolvedChannelId =
      channelId ?? (tid ? slack.decodeThreadId(tid).channel : undefined);
    if (!resolvedChannelId) {
      throw new Error('Pass channelId or threadId, or run inside a thread.');
    }

    const chId = chatChannelId(resolvedChannelId);
    await assertReadableChannel(chId, ctx.threadId);
    await joinChannel(chId);

    const result = tid
      ? await slack.fetchMessages(tid, { limit, cursor })
      : await slack.fetchChannelMessages(chId, { limit, cursor });

    return {
      success: true,
      channelId: chId,
      messages: result.messages.map(formatMessage),
      nextCursor: result.nextCursor,
      message: `Read ${result.messages.length} message${result.messages.length === 1 ? '' : 's'} from ${tid ?? chId}.`,
    };
  },
});
