import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '@/env';
import { slack } from '../../chat/client';
import { chat } from '../../chat/instance';
import { channelContext } from '../../lib/context';
import { rawId } from '../../lib/ids';
import { logger } from '../../lib/logger';

export const leaveChannelTool = createTool({
  id: 'leave_channel',
  description:
    'Leave the current channel entirely: Gorkie removes itself as a member and will no longer see or respond to messages there. Use this only when a user explicitly asks Gorkie to leave the channel. Ends the turn immediately, like skip, call it with no other text and no other tool calls in the same response. Not for muting a single thread, use leave_thread for that. Refuses if the channel id is in the LEAVE_CHANNEL_BLOCKLIST env var.',
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

    const channel = rawId(channelId);
    if (env.LEAVE_CHANNEL_BLOCKLIST.includes(channel)) {
      logger.info('[leave_channel] Refusing to leave blocked channel', {
        channel,
        userId,
        reason,
      });
      throw new Error(
        `Refusing to leave #${channel}: this channel is on the LEAVE_CHANNEL_BLOCKLIST.`
      );
    }

    logger.info('[leave_channel] Leaving channel', {
      channel,
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
        .leave({ channel })
        .catch((error: unknown) => {
          logger.error('[leave_channel] Failed to leave channel', {
            error,
            channelId,
          });
        });
    }, 5000);

    return {
      success: true,
      message: `Leaving #${channel}.`,
    };
  },
});
