import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { withAttribution } from '../../chat/attribution';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { rawId } from '../../lib/ids';
import { parseSlackMessageUrl } from '../../lib/slack-message';
import { assertCanManagePostedMessage } from './utils';

export const editMessageTool = createTool({
  id: 'edit_message',
  description:
    'Edit a Slack message that Gorkie previously sent through post_message for the same requester.',
  inputSchema: z.discriminatedUnion('source', [
    z.object({
      source: z.literal('url'),
      url: z.url(),
      message: z.string().min(1),
    }),
    z.object({
      source: z.literal('id'),
      channelId: z.string().min(1),
      messageId: z.string().min(1),
      message: z.string().min(1),
    }),
  ]),
  execute: async (input, context) => {
    const ctx = channelContext(context?.requestContext);
    const message =
      input.source === 'url'
        ? parseSlackMessageUrl(input.url)
        : { channel: rawId(input.channelId), ts: input.messageId };
    const target = await assertCanManagePostedMessage({
      message,
      ctx,
    });
    await slack.webClient.chat.update({
      channel: target.channel,
      ts: target.ts,
      text: withAttribution({
        message: input.message,
        userId: ctx.userId,
        skipAttribution: target.isSelfDm,
      }),
    });
    return {
      success: true,
      message: `Edited ${target.channel} ${target.ts}.`,
    };
  },
});
