import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { withAttribution } from '../../chat/attribution';
import { resolveTarget, targetSchema } from '../../chat/target';
import { channelContext } from '../../lib/context';
import { rawId } from '../../lib/ids';
import { assertCanPostTo, recordPostedMessage } from './utils';

export const postMessageTool = createTool({
  id: 'post_message',
  description:
    'Post a markdown message to ANOTHER target (thread, channel, or user). Your streamed reply is the message to the current thread; use this only to message somewhere else. Channel/thread targets must be in the channel this conversation is already in, and user targets must be the requester themselves. A footer crediting the requester is appended automatically, so do not add your own attribution.',
  inputSchema: z.object({
    ...targetSchema.shape,
    message: z.string().min(1).describe('Markdown message body.'),
  }),
  execute: async ({ type, id, message }, context) => {
    const ctx = channelContext(context?.requestContext);
    const target = { type, id };
    assertCanPostTo({ target, ctx });
    const isCurrentThread =
      target.type === 'thread' && target.id === ctx.threadId;
    const isSelfDm =
      target.type === 'user' &&
      !!ctx.userId &&
      rawId(target.id) === rawId(ctx.userId);
    const markdown = withAttribution({
      message,
      userId: ctx.userId,
      skipAttribution: isCurrentThread || isSelfDm,
    });
    try {
      const destination = await resolveTarget(target);
      const sent = await destination.post({ markdown });
      await recordPostedMessage({
        target,
        sent,
        requestedBy: ctx.userId,
        isSelfDm,
      });
      return {
        success: true,
        messageId: sent.id,
        threadId: sent.threadId,
        message: `Posted to ${target.type} ${target.id}.`,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason.includes('channel_not_found')) {
        throw new Error(
          'Slack rejected the post with channel_not_found. For private channels this means Gorkie is not a member. Slack hides private channels from non-members entirely. Ask a member to run `/invite @gorkie` in that channel, then retry. If the channel is public, double-check the id (it must come from a tool output or mention, e.g. slack:C...).',
          { cause: error }
        );
      }
      if (reason.includes('not_in_channel')) {
        throw new Error(
          'Slack rejected the post with not_in_channel: Gorkie must join that channel before posting. Ask a member to run `/invite @gorkie` there, then retry.',
          { cause: error }
        );
      }
      throw error;
    }
  },
});
