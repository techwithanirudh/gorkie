import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../channels/slack';
import { rawId } from './slack-context';
import { channelContext } from '../types';

export const getChannelInfoTool = createTool({
  id: 'get_channel_info',
  description:
    'Inspect a Slack channel (name, topic, purpose, privacy, member count). Defaults to the current channel.',
  inputSchema: z.object({
    channelId: z
      .string()
      .optional()
      .describe('Channel id; defaults to the current channel.'),
  }),
  execute: async ({ channelId }, context) => {
    const id = rawId(channelId ?? channelContext(context?.requestContext).channelId ?? '');
    if (!id) throw new Error('No channel to inspect.');
    const res = await slack.webClient.conversations.info({ channel: id });
    const c = res.channel;
    return {
      id: c?.id,
      name: c?.name,
      topic: c?.topic?.value || undefined,
      purpose: c?.purpose?.value || undefined,
      isPrivate: c?.is_private,
      memberCount: c?.num_members,
    };
  },
});
