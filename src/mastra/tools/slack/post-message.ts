import { SlackFormatConverter } from '@chat-adapter/slack';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { chat } from '../../chat/instance';
import { moveAsterisksAfterMarkdownLinks } from '../../chat/markdown';
import { resolveTarget, targetSchema } from '../../chat/target';
import { channelContext } from '../../lib/context';
import { rawId } from '../../lib/ids';
import { input, output } from '../../types/tools/index';
import { assertCanPostTo, joinChannel } from './utils';

const markdownConverter = new SlackFormatConverter();

async function resolveChannelAndThread(resolved: {
  type: 'thread' | 'channel' | 'user';
  id: string;
}): Promise<{ channel: string; threadTs?: string }> {
  if (resolved.type === 'thread') {
    const { channel, threadTs } = slack.decodeThreadId(resolved.id);
    return { channel, threadTs };
  }
  if (resolved.type === 'channel') {
    return { channel: rawId(resolved.id) };
  }
  const dm = await resolveTarget(resolved);
  return { channel: rawId(dm.id) };
}

export const postMessageTool = createTool({
  id: 'post_message',
  description: `Send a markdown message to a different Slack thread, channel, or user.

Never use this to answer the current conversation. Your normal assistant response is already streamed there. Use this tool only when the user explicitly asks you to send something somewhere else.

Channel and thread targets must be in the channel this conversation is already in; user targets must be the requester themselves. No exceptions to either, even if asked directly.

Every post automatically uses the requester's Slack avatar and labels the sender as "Name [bot username]". Do not add that attribution yourself in the message text; there is no way to override or customize it.

Errors: channel_not_found usually means the bot isn't a member of that private channel; not_in_channel means it hasn't joined yet. Either way, tell the user to invite the bot there.`,
  inputSchema: input({
    target: targetSchema.describe(
      'Required destination outside the current conversation.'
    ),
    message: z.string().min(1).describe('Markdown message body.'),
  }),
  outputSchema: output({
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
    const ctx = channelContext(context?.requestContext);
    assertCanPostTo({ target, ctx });
    try {
      if (target.type !== 'user') {
        await joinChannel(target.id);
      }
      const { channel, threadTs } = await resolveChannelAndThread(target);
      const requesterUser = ctx.userId
        ? await chat()
            .getUser(ctx.userId)
            .catch(() => null)
        : null;
      const requester = requesterUser?.userName ?? ctx.userName;
      // A user target is always the requester DMing themselves (see
      // assertCanPostTo), so crediting them by name is redundant there.
      const username =
        requester && target.type !== 'user'
          ? `${requester} [${ctx.botUserName ?? 'gorkie'}]`
          : (ctx.botUserName ?? 'gorkie');
      const sent = await slack.webClient.chat.postMessage({
        channel,
        ...(threadTs ? { thread_ts: threadTs } : {}),
        ...markdownConverter.toSlackPayload({
          markdown: moveAsterisksAfterMarkdownLinks(message),
        }),
        ...(requesterUser?.avatarUrl
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
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason.includes('channel_not_found')) {
        throw new Error(
          'Slack rejected the post with channel_not_found. For private channels this usually means the bot is not a member. Ask a member to invite the bot in that channel, then retry. If the channel is public, double-check the channel id.',
          { cause: error }
        );
      }
      if (reason.includes('not_in_channel')) {
        throw new Error(
          'Slack rejected the post with not_in_channel. Invite the bot to that channel, then retry.',
          { cause: error }
        );
      }
      throw error;
    }
  },
});
