import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { channelContext } from '../../lib/context';
import { spendSlackCall } from '../../lib/slack-budget';
import { assertReadableChannel } from './utils';

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
    const id = channelId ?? ctx.channelId;
    if (!id) {
      throw new Error('No channel to inspect.');
    }
    spendSlackCall(context.requestContext);

    const info = await assertReadableChannel({
      channelId: id,
      currentThreadId: ctx.threadId,
    });
    return {
      channelId: info.id,
      name: info.name,
      isDM: info.isDM ?? false,
      memberCount: info.memberCount,
      visibility: info.channelVisibility,
    };
  },
});
