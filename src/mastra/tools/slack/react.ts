import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { parseSlackInput } from '../../lib/ids';
import { assertCanPostTo } from './access';

export const reactTool = createTool({
  id: 'react',
  description:
    'Add or remove an emoji reaction on a Slack message in the current conversation, by message timestamp or message URL. Messages in other channels or DMs cannot be reacted to. This does not end the turn: continue with a written answer when one is useful. For a reaction-only response, call skip after this tool.',
  inputSchema: z.strictObject({
    channelId: z
      .string()
      .optional()
      .describe(
        'Slack channel id. Defaults to the current channel if omitted.'
      ),
    messageId: z
      .string()
      .optional()
      .describe('Slack message timestamp. Required unless url is given.'),
    url: z
      .url()
      .optional()
      .describe('Slack message URL, instead of channelId/messageId.'),
    action: z.enum(['add', 'remove']).default('add'),
    emoji: z.string().min(1).describe('Emoji name without colons.'),
  }),
  outputSchema: z.strictObject({
    action: z.enum(['add', 'remove']),
    channelId: z.string(),
    messageId: z.string(),
    emoji: z.string(),
  }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: `${output?.action === 'remove' ? 'Removed' : 'Added'} :${output?.emoji ?? ''}:`,
      }),
    },
  },
  execute: async (
    { channelId, messageId, url, action, emoji: emojiInput },
    context
  ) => {
    const ctx = channelContext(context.requestContext);
    const message = parseSlackInput(url ?? messageId ?? ctx.messageId);
    const channel =
      message.channel ?? parseSlackInput(channelId ?? ctx.channelId).channel;
    if (!channel) {
      throw new Error('No channel available for react.');
    }
    if (!message.threadTs) {
      throw new Error('Pass messageId or url.');
    }
    assertCanPostTo({ target: { type: 'channel', id: channel }, ctx });

    const emoji = emojiInput.replaceAll(':', '');
    // Not slack.addReaction: its emoji resolver renames Slack names such as
    // cry and cool to other emoji, and custom emoji with those names.
    const request = { channel, name: emoji, timestamp: message.threadTs };
    if (action === 'remove') {
      await slack.webClient.reactions.remove(request);
    } else {
      await slack.webClient.reactions.add(request);
    }
    return {
      action,
      channelId: slack.channelIdFromThreadId(
        slack.encodeThreadId({ channel, threadTs: message.threadTs })
      ),
      messageId: message.threadTs,
      emoji,
    };
  },
});
