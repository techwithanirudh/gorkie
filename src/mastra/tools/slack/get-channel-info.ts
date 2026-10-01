import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { parseSlackInput } from '../../lib/ids';
import { spendSlackCall } from '../../lib/slack-budget';
import { assertCanRead } from './access';

export const getChannelInfoTool = createTool({
  id: 'get_channel_info',
  description:
    'Inspect one Slack channel by id. Returns its name, member count, DM status, and visibility. Defaults to the current channel. The current conversation is always readable; other channels must be public. This does not read messages or discover channels by name.',
  inputSchema: z.strictObject({
    channelId: z
      .string()
      .optional()
      .describe(
        'Conversation id (slack:C..., slack:D..., or slack:G...). Omit for the current conversation. Never derive this from a user id.'
      ),
  }),
  outputSchema: z.strictObject({
    channelId: z.string(),
    name: z.string().optional(),
    isDM: z.boolean(),
    memberCount: z.number().optional(),
    visibility: z.string().optional(),
  }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: output?.name ?? output?.channelId ?? 'Channel found',
      }),
    },
  },
  execute: async ({ channelId }, context) => {
    const ctx = channelContext(context.requestContext);
    const { channel } = parseSlackInput(channelId ?? ctx.channelId);
    if (!channel) {
      throw new Error('No channel to inspect.');
    }
    spendSlackCall(context.requestContext);

    const conversation = slack.channelIdFromThreadId(
      slack.encodeThreadId({ channel, threadTs: '' })
    );
    const info = await slack.fetchChannelInfo(conversation);
    // Only a non-public channel needs the current-conversation check, which
    // makes no further call when it passes.
    if (info.channelVisibility !== 'workspace') {
      await assertCanRead({ channelId: channel, ctx });
    }
    return {
      channelId: conversation,
      name: info.name,
      isDM: info.isDM ?? false,
      memberCount: info.memberCount,
      visibility: info.channelVisibility,
    };
  },
});
