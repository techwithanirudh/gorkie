import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { chatChannelId, parseSlackId } from '../../lib/ids';
import { input, output } from '../../types/tools/index';
import { assertCanManagePostedMessage } from './utils';

export const deleteMessageTool = createTool({
  id: 'delete_message',
  description:
    'Delete a Slack message you sent earlier with post_message. Only the person who asked for that message can have it deleted.',
  inputSchema: input({
    channelId: z
      .string()
      .optional()
      .describe('Slack channel id. Defaults to the current channel.'),
    messageId: z
      .string()
      .optional()
      .describe('Slack message timestamp. Required unless url is given.'),
    url: z
      .url()
      .optional()
      .describe('Slack message URL, instead of channelId/messageId.'),
  }),
  outputSchema: output({ channelId: z.string(), messageId: z.string() }),
  execute: async ({ channelId, messageId, url }, context) => {
    const ctx = channelContext(context?.requestContext);
    const { channel, ts } = parseSlackId(url ?? messageId, {
      channel: channelId ?? ctx.channelId,
    });
    if (!(channel && ts)) {
      throw new Error('Pass messageId or url.');
    }
    await assertCanManagePostedMessage({ channel, ts, ctx });
    await slack.webClient.chat.delete({ channel, ts });
    return { channelId: chatChannelId(channel), messageId: ts };
  },
});
