import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { channelContext } from '../types';
import { assertReadableChannel } from './utils';

export const getChannelInfoTool = createTool({
  id: 'get_channel_info',
  description:
    'Fetch metadata for a channel: name, member count, DM status, visibility. Defaults to the current channel.',
  inputSchema: z.object({
    channelId: z.string().optional().describe('Channel id; defaults to the current channel.'),
  }),
  execute: async ({ channelId }, context) => {
    const ctx = channelContext(context?.requestContext);
    const id = channelId ?? ctx.channelId;
    if (!id) throw new Error('No channel to inspect.');
    const info = await assertReadableChannel(id, ctx.threadId);
    return {
      id: info.id,
      name: info.name,
      isDM: info.isDM ?? false,
      memberCount: info.memberCount,
      channelVisibility: info.channelVisibility,
    };
  },
});
