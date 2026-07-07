import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { chat } from '../../chat/instance';
import { channelContext } from '../../lib/context';
import { rawId } from '../../lib/ids';
import { logger } from '../../lib/logger';

export const leaveChannelTool = createTool({
  id: 'leave_channel',
  description:
    'Leave the current channel entirely: Gorkie removes itself as a member and will no longer see or respond to messages there. Use this only when a user explicitly asks Gorkie to leave the channel. Ends the turn immediately, like skip, call it with no other text and no other tool calls in the same response. Not for muting a single thread, use leave_thread for that.',
  inputSchema: z.object({
    reason: z
      .string()
      .optional()
      .describe('Optional short reason for leaving, for logging.'),
  }),
  execute: async ({ reason }, context) => {
    const { channelId, threadId, userId, isDM } = channelContext(
      context?.requestContext
    );
    if (!channelId) {
      throw new Error('No current channel.');
    }
    if (isDM) {
      throw new Error('Cannot leave a direct message conversation.');
    }

    logger.info('[leave_channel] Leaving channel', {
      channelId,
      userId,
      reason,
    });

    if (threadId) {
      await chat()
        .thread(threadId)
        .unsubscribe()
        .catch(() => undefined);
    }

    setTimeout(() => {
      slack.webClient.conversations
        .leave({ channel: rawId(channelId) })
        .catch((error: unknown) => {
          logger.error('[leave_channel] Failed to leave channel', {
            error,
            channelId,
          });
        });
    }, 5000);

    return {
      success: true,
      message: `Leaving #${rawId(channelId)}.`,
    };
  },
});
