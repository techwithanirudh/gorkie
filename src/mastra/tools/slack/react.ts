import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { chatChannelId, parseSlackId } from '../../lib/ids';
import { input, output } from '../../types/tools/index';
import { assertReadableChannel } from './utils';

export const reactTool = createTool({
  id: 'react',
  description:
    'Add or remove an emoji reaction on a Slack message by current channel timestamp, channel/message id, or message URL.',
  inputSchema: input({
    channelId: z
      .string()
      .optional()
      .describe(
        'Slack channel id. Defaults to the current channel if omitted.'
      ),
    messageId: z
      .string()
      .optional()
      .describe(
        'Slack message timestamp. Defaults to the current message if omitted.'
      ),
    url: z
      .url()
      .optional()
      .describe('Slack message URL, instead of channelId/messageId.'),
    action: z.enum(['add', 'remove']).default('add'),
    emoji: z.string().min(1).describe('Emoji name without colons.'),
  }),
  outputSchema: output({
    action: z.enum(['add', 'remove']),
    channelId: z.string(),
    messageId: z.string(),
    emoji: z.string(),
  }),
  transform: {
    display: {
      input: () => ({ summary: null }),
      output: ({ output }) => ({
        summary: `${output?.action === 'remove' ? 'removed' : 'added'} :${output?.emoji ?? ''}:`,
      }),
    },
  },
  execute: async (
    { channelId, messageId, url, action, emoji: emojiInput },
    context
  ) => {
    const ctx = channelContext(context.requestContext);
    const target = parseSlackId(url ?? messageId ?? ctx.messageId, {
      channel: channelId ?? ctx.channelId,
    });
    if (!target.channel) {
      throw new Error('No channel available for react.');
    }
    if (!target.ts) {
      throw new Error('Pass messageId or url.');
    }
    await assertReadableChannel({
      channelId: chatChannelId(target.channel),
      currentThreadId: ctx.threadId,
    });

    const emoji = emojiInput.replaceAll(':', '');
    await slack.webClient.reactions[action]({
      channel: target.channel,
      name: emoji,
      timestamp: target.ts,
    });
    return {
      action,
      channelId: chatChannelId(target.channel),
      messageId: target.ts,
      emoji,
    };
  },
});
