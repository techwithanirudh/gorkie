import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { chat } from '../../chat/instance';
import { assertCanSendTo, offerSend } from '../../chat/send';
import { targetSchema } from '../../chat/target';
import { channelContext } from '../../lib/context';
import { parseSlackId, rawId } from '../../lib/ids';
import { assertWithinLimit } from '../../lib/limits';
import { input, output } from '../../types/tools/index';

function destinationOf(target: z.infer<typeof targetSchema>) {
  if (target.type === 'user') {
    const userId = rawId(target.id);
    return { userId, label: `a DM to <@${userId}>` };
  }
  if (target.type === 'channel') {
    const channel = rawId(target.id);
    return { channel, label: `<#${channel}>` };
  }
  const { channel, ts } = parseSlackId(target.id);
  if (!channel) {
    throw new Error(`${target.id} is not a Slack thread id.`);
  }
  return { channel, threadTs: ts, label: `a thread in <#${channel}>` };
}

export const postMessageTool = createTool({
  id: 'post_message',
  description: `Send a markdown message to a different Slack thread, channel, or person, on behalf of the person asking.

Never use this to answer the current conversation or to report progress: use reply and status_update.

This only prepares the message. The person sees a private preview with Send and Cancel buttons, and nothing goes out until they click Send. The result is "awaiting_confirmation": don't say it was sent or describe the preview. If nothing else needs an answer, call skip. You are not told the outcome; the preview itself shows it.

The message goes out with the person's avatar, named "gorkie on behalf of Name", with a "Sent by" line. Don't add attribution yourself. Find channel ids with list_channels.`,
  inputSchema: input({
    target: targetSchema.describe('Destination outside this conversation.'),
    message: z.string().min(1).max(6000).describe('Markdown message body.'),
  }),
  outputSchema: output({
    status: z.literal('awaiting_confirmation'),
    destination: z.string(),
  }),
  transform: {
    display: {
      output: () => ({ summary: 'Waiting for the person to confirm' }),
    },
  },
  execute: async ({ target, message }, context) => {
    const ctx = channelContext(context?.requestContext);
    if (!(ctx.userId && ctx.channelId)) {
      throw new Error('Sending on behalf needs a person here to confirm it.');
    }
    await assertWithinLimit({
      kind: 'send',
      requestContext: context?.requestContext,
    });
    const destination = destinationOf(target);
    const previewChannel = rawId(ctx.channelId);
    if (destination.channel) {
      await assertCanSendTo({
        channel: destination.channel,
        currentChannelId: previewChannel,
        requesterId: ctx.userId,
      });
    }
    const requester = await chat()
      .getUser(ctx.userId)
      .catch(() => null);
    const name = requester?.fullName || requester?.userName || ctx.userName;
    await offerSend({
      pending: {
        ...destination,
        message,
        requesterId: ctx.userId,
        username: `gorkie on behalf of ${name ?? 'someone'}`.slice(0, 80),
        avatarUrl: requester?.avatarUrl,
      },
      previewChannel,
      previewThreadTs: ctx.threadId ? parseSlackId(ctx.threadId).ts : undefined,
    });
    return {
      status: 'awaiting_confirmation' as const,
      destination: destination.label,
    };
  },
});
