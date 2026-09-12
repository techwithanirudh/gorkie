import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { chatChannelId, parseSlackId } from '../../lib/ids';
import { input, output } from '../../types/tools/index';

export const getPermalinkTool = createTool({
  id: 'get_permalink',
  description:
    'Resolve one Slack message or thread identifier to its permanent URL. Pass a full Slack id, or a message timestamp with an optional channel id. The channel defaults to the current channel. Do not use this to search for a message.',
  inputSchema: input({
    messageId: z.string().min(1),
    channelId: z.string().optional(),
  }),
  outputSchema: output({
    channelId: z.string(),
    messageTs: z.string(),
    permalink: z.url(),
  }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: output?.permalink ?? 'Permalink resolved',
      }),
    },
  },
  execute: async ({ messageId, channelId }, context) => {
    const { channel, ts } = parseSlackId(messageId, {
      channel: channelId ?? channelContext(context?.requestContext).channelId,
    });
    if (!channel) {
      throw new Error('Pass channelId or run inside the message channel.');
    }
    if (!ts) {
      throw new Error(`${messageId} is not a Slack message id.`);
    }
    const response = await slack.webClient.chat.getPermalink({
      channel,
      message_ts: ts,
    });
    if (!response.permalink) {
      throw new Error('Slack did not return a permalink for that message.');
    }
    return {
      channelId: chatChannelId(channel),
      messageTs: ts,
      permalink: response.permalink,
    };
  },
});
