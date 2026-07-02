import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { withAttribution } from '../../chat/attribution';
import { resolveTarget, targetSchema } from '../../chat/target';
import { channelContext } from '../../lib/context';

export const postMessageTool = createTool({
  id: 'post_message',
  description:
    'Post a markdown message to ANOTHER target (thread, channel, or user). Your streamed reply is the message to the current thread; use this only to message somewhere else.',
  inputSchema: z.object({
    ...targetSchema.shape,
    message: z.string().min(1).describe('Markdown message body.'),
  }),
  execute: async ({ type, id, message }, context) => {
    const { threadId: currentThreadId, userId } = channelContext(
      context?.requestContext
    );
    const isCurrentThread = type === 'thread' && id === currentThreadId;
    const markdown = withAttribution(message, userId, isCurrentThread);
    const destination = await resolveTarget({ type, id });
    const sent = await destination.post({ markdown });
    return {
      success: true,
      messageId: sent.id,
      threadId: sent.threadId,
      message: `Posted to ${type} ${id}.`,
    };
  },
});
