import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { chat } from '../../chat/instance';
import { neutralizeBroadcasts } from '../../chat/message';
import { assertCanSendTo, deliver } from '../../chat/send';
import { type Target, targetSchema } from '../../chat/target';
import { channelContext } from '../../lib/context';
import { parseSlackId, rawId } from '../../lib/ids';
import type { ChannelContext } from '../../types';
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

function isDmToRequester({
  ctx,
  target,
}: {
  ctx: ChannelContext;
  target: Target;
}): boolean {
  return (
    target.type === 'user' &&
    Boolean(ctx.userId) &&
    rawId(target.id) === rawId(ctx.userId ?? '')
  );
}

async function checkDestination({
  ctx,
  target,
}: {
  ctx: ChannelContext;
  target: Target;
}) {
  if (!(ctx.userId && ctx.channelId)) {
    throw new Error('Sending on behalf needs a person here to approve it.');
  }
  const destination = destinationOf(target);
  if (destination.channel) {
    await assertCanSendTo({
      channel: destination.channel,
      currentChannelId: rawId(ctx.channelId),
      requesterId: ctx.userId,
    });
  }
  return { destination, requesterId: ctx.userId };
}

export const postMessageTool = createTool({
  id: 'post_message',
  description: `Send a markdown message to a different Slack thread, channel, or person, on behalf of the person asking.

Never use this to answer the current conversation or to report progress: answer in your text and use status_update.

A DM to the person asking goes out directly. Anything else waits for the person to approve it on a card in this thread, and you get the result once they decide.

The message goes out with the person's avatar, named "Name [gorkie]", with a "Sent by" line, except a DM to the person asking, which comes from gorkie. Don't add attribution yourself. Find a channel id with search_slack, content "channels".`,
  inputSchema: input({
    target: targetSchema.describe('Destination outside this conversation.'),
    message: z.string().min(1).max(6000).describe('Markdown message body.'),
  }),
  outputSchema: output({
    status: z.enum(['sent', 'not_sent']),
    destination: z.string(),
    link: z.string().optional(),
    reason: z.string().optional(),
  }),
  requireApproval: (input, ctx) =>
    !isDmToRequester({
      ctx: channelContext(ctx?.requestContext),
      target: input.target,
    }),
  // Rejects a destination before a card is shown for it.
  beforeApproval: async ({ target }, ctx) => {
    try {
      await checkDestination({
        ctx: channelContext(ctx.requestContext),
        target,
      });
    } catch (error) {
      return {
        proceed: false,
        output: {
          status: 'not_sent' as const,
          destination: target.id,
          reason: error instanceof Error ? error.message : String(error),
        },
      };
    }
  },
  transform: {
    display: {
      input: () => ({ summary: null }),
      output: ({ output }) => ({
        summary: output?.status === 'sent' ? 'message sent' : 'not sent',
      }),
    },
  },
  execute: async ({ target, message }, context) => {
    const ctx = channelContext(context?.requestContext);
    const text = neutralizeBroadcasts(message);
    if (isDmToRequester({ ctx, target })) {
      const dm = await chat().openDM(ctx.userId ?? '');
      await dm.post({ markdown: text });
      return { status: 'sent' as const, destination: 'your DMs' };
    }
    // The approval can sit for a while, so the checks run again here.
    const { destination, requesterId } = await checkDestination({
      ctx,
      target,
    });
    const channel = destination.userId
      ? rawId((await chat().openDM(destination.userId)).channelId)
      : destination.channel;
    if (!channel) {
      throw new Error('That destination has no channel to post in.');
    }
    const requester = await chat()
      .getUser(requesterId)
      .catch(() => null);
    const link = await deliver({
      avatarUrl: requester?.avatarUrl,
      channel,
      message: text,
      requesterId,
      threadTs: destination.threadTs,
      username:
        `${requester?.userName || ctx.userName || 'someone'} [gorkie]`.slice(
          0,
          80
        ),
    });
    return { status: 'sent' as const, destination: destination.label, link };
  },
});
