import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { rawId } from '../../lib/ids';
import { parseSlackMessageUrl } from '../../lib/slack-message';
import { assertCanManagePostedMessage } from './utils';

export const deleteMessageTool = createTool({
  id: 'delete_message',
  description:
    'Delete a Slack message that Gorkie previously sent through post_message for the same requester.',
  inputSchema: z.discriminatedUnion('source', [
    z.object({ source: z.literal('url'), url: z.url() }),
    z.object({
      source: z.literal('id'),
      channelId: z.string().min(1),
      messageId: z.string().min(1),
    }),
  ]),
  execute: async (input, context) => {
    const message =
      input.source === 'url'
        ? parseSlackMessageUrl(input.url)
        : { channel: rawId(input.channelId), ts: input.messageId };
    const target = await assertCanManagePostedMessage({
      message,
      ctx: channelContext(context?.requestContext),
    });
    await slack.webClient.chat.delete({
      channel: target.channel,
      ts: target.ts,
    });
    return {
      success: true,
      message: `Deleted ${target.channel} ${target.ts}.`,
    };
  },
});
