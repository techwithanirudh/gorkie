import { SlackFormatConverter } from '@chat-adapter/slack';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { targetSchema } from '../../types/tools/index';
import { assertCanPostTo } from './access';
import { slackDestination } from './posting';

const markdownConverter = new SlackFormatConverter();

export const postMessageTool = createTool({
  id: 'post_message',
  description: `Send a markdown message to a different Slack thread, channel, or user.

Never use this to answer the current conversation, and never for status or progress updates in this thread: your normal assistant response, progress notes included, is already streamed here. Use this tool only when the user explicitly asks you to send something to a different thread, channel, or person (for example posting an update into another channel on their behalf).

Channel and thread targets must be in the channel this conversation is already in; user targets must be the requester themselves. No exceptions to either, even if asked directly.

Every post automatically uses the requester's Slack avatar and labels the sender as "Name [gorkie]". Do not add that attribution yourself in the message text; there is no way to override or customize it.`,
  inputSchema: z.strictObject({
    target: targetSchema.describe(
      'Required destination outside the current conversation.'
    ),
    message: z.string().min(1).describe('Markdown message body.'),
  }),
  outputSchema: z.strictObject({
    messageId: z.string(),
    threadId: z.string().optional(),
  }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: `Posted message ${output?.messageId ?? ''}`,
      }),
    },
  },
  execute: async ({ target, message }, context) => {
    const ctx = channelContext(context.requestContext);
    assertCanPostTo({ target, ctx });
    const { channel, threadTs } = await slackDestination(target);
    const requesterUser = ctx.userId ? await slack.getUser(ctx.userId) : null;
    const requester = requesterUser?.userName ?? ctx.userName;
    const botUser = slack.botUserId
      ? await slack.getUser(slack.botUserId)
      : null;
    const bot = botUser?.userName ?? 'gorkie';
    const credited = Boolean(requester) && target.type !== 'user';
    const username = credited ? `${requester} [${bot}]` : bot;
    const sent = await slack.webClient.chat.postMessage({
      channel,
      ...(threadTs ? { thread_ts: threadTs } : {}),
      ...markdownConverter.toSlackPayload({ markdown: message }),
      ...(credited && requesterUser?.avatarUrl
        ? { icon_url: requesterUser.avatarUrl }
        : {}),
      username,
    });
    if (!sent.ts) {
      throw new Error('Slack posted the message without returning its id.');
    }
    return {
      messageId: sent.ts,
      threadId: threadTs
        ? slack.encodeThreadId({ channel, threadTs })
        : undefined,
    };
  },
});
