import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { chat } from '../../chat/instance';
import { neutralizeBroadcasts } from '../../chat/message';
import { assertCanSendTo, deliver, offerSend } from '../../chat/send';
import { type Target, targetSchema } from '../../chat/target';
import { channelContext } from '../../lib/context';
import { parseSlackId, rawId } from '../../lib/ids';
import { input, output } from '../../types/tools/index';

function destinationOf(target: Target) {
  if (target.type === 'user') {
    const userId = rawId(target.id);
    return { userId, label: `a DM to <@${userId}>` };
  }
  if (target.type === 'channel') {
    const channel = rawId(target.id);
    return { channel, label: `<#${channel}>` };
  }
  const { channel, ts } = parseSlackId(target.id);
  if (!(channel && ts)) {
    throw new Error(`${target.id} is not a Slack thread id.`);
  }
  return { channel, threadTs: ts, label: `a thread in <#${channel}>` };
}

export const postMessageTool = createTool({
  id: 'post_message',
  description: `Send a markdown message to a different Slack thread, channel, or person, on behalf of the person asking.

Never use this to answer the current conversation or to report progress: use reply and status_update.

A DM to the person asking goes out directly with status "sent". Anything else only prepares the message: the person sees a private preview with Send and Cancel buttons, nothing goes out until they click Send, and the status is "awaiting_confirmation". In that case don't say it was sent or describe the preview, and if nothing else needs an answer, call skip. You are not told the outcome; the preview itself shows it.

The message goes out with the person's avatar, named "Name [gorkie]", with a "Sent by" line. Don't add attribution yourself. Find channel ids with list_channels.`,
  inputSchema: input({
    target: targetSchema.describe('Destination outside this conversation.'),
    message: z.string().min(1).max(6000).describe('Markdown message body.'),
  }),
  outputSchema: output({
    status: z.enum(['sent', 'awaiting_confirmation']),
    destination: z.string(),
  }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary:
          output?.status === 'sent'
            ? 'Message sent'
            : 'Waiting for the person to confirm',
      }),
    },
  },
  execute: async ({ target, message }, context) => {
    const ctx = channelContext(context?.requestContext);
    if (!(ctx.userId && ctx.channelId)) {
      throw new Error('Sending on behalf needs a person here to confirm it.');
    }
    const destination = destinationOf(target);
    const previewChannel = rawId(ctx.channelId);
    if (destination.channel) {
      await assertCanSendTo({
        channel: destination.channel,
        currentChannelId: previewChannel,
        requesterId: ctx.userId,
      });
    }
    const isOwnDestination = destination.userId === rawId(ctx.userId);
    const requester = await chat()
      .getUser(ctx.userId)
      .catch(() => null);
    const name = requester?.userName || ctx.userName;
    const pending = {
      ...destination,
      message: neutralizeBroadcasts(message),
      requesterId: ctx.userId,
      username: `${name ?? 'someone'} [gorkie]`.slice(0, 80),
      avatarUrl: requester?.avatarUrl,
    };
    // Scheduled runs deliver here with nobody around to click Send, and a DM to
    // the requester speaks for no one else.
    if (isOwnDestination) {
      await deliver(pending);
      return { status: 'sent' as const, destination: destination.label };
    }
    await offerSend({
      pending,
      previewChannel,
      previewThreadTs: ctx.threadId ? parseSlackId(ctx.threadId).ts : undefined,
    });
    return {
      status: 'awaiting_confirmation' as const,
      destination: destination.label,
    };
  },
});
