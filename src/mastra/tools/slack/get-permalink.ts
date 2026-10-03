import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { parseSlackInput } from '../../lib/ids';
import { assertCanRead } from './access';
import { spendSlackCall } from './budget';

export const getPermalinkTool = createTool({
  id: 'get_permalink',
  description:
    'Resolve one Slack message or thread identifier to its permanent URL. Pass a full Slack id, or a message timestamp with an optional channel id. The channel defaults to the current channel. Do not use this to search for a message.',
  inputSchema: z.strictObject({
    messageId: z.string().min(1),
    channelId: z.string().optional(),
  }),
  outputSchema: z.strictObject({
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
    const ctx = channelContext(context.requestContext);
    const message = parseSlackInput(messageId);
    const channel =
      message.channel ?? parseSlackInput(channelId ?? ctx.channelId).channel;
    const ts = message.threadTs;
    if (!channel) {
      throw new Error('Pass channelId or run inside the message channel.');
    }
    if (!ts) {
      throw new Error(`${messageId} is not a Slack message id.`);
    }
    await assertCanRead({ channelId: channel, ctx });
    spendSlackCall(context.requestContext);

    const response = await slack.webClient.chat.getPermalink({
      channel,
      message_ts: ts,
    });
    if (!response.permalink) {
      throw new Error('Slack did not return a permalink for that message.');
    }
    return {
      channelId: slack.channelIdFromThreadId(
        slack.encodeThreadId({ channel, threadTs: ts })
      ),
      messageTs: ts,
      permalink: response.permalink,
    };
  },
});
