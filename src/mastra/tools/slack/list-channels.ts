import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { chatChannelId } from '../../lib/ids';
import { spendSlackCall } from '../../lib/slack-budget';
import { input, optionalCursor, output } from '../../types/tools/index';

export const listChannelsTool = createTool({
  id: 'list_channels',
  description:
    'List or filter Slack channels visible to the bot. Search applies to channel names, topics, and purposes within each paginated Slack result page.',
  inputSchema: input({
    query: z.string().min(1).optional(),
    includeArchived: z.boolean().default(false),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    cursor: optionalCursor,
  }),
  outputSchema: output({
    channels: z.array(
      z.strictObject({
        channelId: z.string(),
        name: z.string().optional(),
        archived: z.boolean(),
        member: z.boolean(),
        private: z.boolean(),
        memberCount: z.number().optional(),
        purpose: z.string().optional(),
        topic: z.string().optional(),
      })
    ),
    nextCursor: z.string().optional(),
  }),
  transform: {
    display: {
      output: ({ input, output }) => ({
        summary: `Found ${output?.channels.length ?? 0} channels${input?.query ? ` matching "${input.query}"` : ''}`,
      }),
    },
  },
  execute: async ({ query, includeArchived, limit, cursor }, context) => {
    spendSlackCall(context?.requestContext);

    const response = await slack.webClient.conversations.list({
      cursor,
      exclude_archived: !includeArchived,
      limit,
      types: 'public_channel,private_channel',
    });
    const channels = (response.channels ?? []).flatMap((channel) =>
      channel.id
        ? [
            {
              channelId: chatChannelId(channel.id),
              name: channel.name,
              archived: channel.is_archived ?? false,
              member: channel.is_member ?? false,
              private: channel.is_private ?? false,
              memberCount: channel.num_members,
              purpose: channel.purpose?.value || undefined,
              topic: channel.topic?.value || undefined,
            },
          ]
        : []
    );
    const normalizedQuery = query?.toLowerCase();
    const matches = normalizedQuery
      ? channels.filter((channel) =>
          [channel.name, channel.topic, channel.purpose].some((value) =>
            value?.toLowerCase().includes(normalizedQuery)
          )
        )
      : channels;
    return {
      channels: matches,
      nextCursor: response.response_metadata?.next_cursor || undefined,
    };
  },
});
