import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSearchToken } from '../chat/search-token';
import { slack } from '../chat/slack';
import { channelContext } from '../lib/context';

const contextMessage = z
  .looseObject({
    text: z.string().optional(),
    ts: z.string().optional(),
    user_id: z.string().optional(),
  })
  .transform((m) => ({ text: m.text ?? '', ts: m.ts, userId: m.user_id }));

const searchResponse = z.looseObject({
  ok: z.boolean(),
  error: z.string().optional(),
  response_metadata: z
    .looseObject({ next_cursor: z.string().optional() })
    .optional(),
  results: z
    .looseObject({
      messages: z
        .array(
          z
            .looseObject({
              author_name: z.string().optional(),
              author_user_id: z.string().optional(),
              channel_id: z.string().optional(),
              channel_name: z.string().optional(),
              content: z.string().optional(),
              context_messages: z
                .looseObject({
                  after: z.array(contextMessage).optional(),
                  before: z.array(contextMessage).optional(),
                })
                .optional(),
              is_author_bot: z.boolean().optional(),
              message_ts: z.string().optional(),
              permalink: z.string().optional(),
              team_id: z.string().optional(),
            })
            .transform((m) => ({
              author: m.author_name,
              userId: m.author_user_id,
              channelId: m.channel_id,
              channelName: m.channel_name,
              text: m.content ?? '',
              context: m.context_messages
                ? {
                    after: m.context_messages.after ?? [],
                    before: m.context_messages.before ?? [],
                  }
                : undefined,
              isAuthorBot: m.is_author_bot,
              ts: m.message_ts,
              permalink: m.permalink,
              teamId: m.team_id,
            }))
        )
        .optional(),
    })
    .optional(),
});

export const searchSlackTool = createTool({
  id: 'search_slack',
  description:
    'Search Slack messages for past conversations, decisions, links, or people outside the current thread. Use specific queries (keywords, names, channels, dates).',
  inputSchema: z.object({
    query: z.string().min(1).max(500),
    cursor: z
      .string()
      .optional()
      .describe('Cursor from a previous result page.'),
  }),
  execute: async ({ query, cursor }, context) => {
    const threadId = channelContext(context?.requestContext).threadId;
    const token = threadId ? getSearchToken(threadId) : undefined;
    if (!token) {
      return {
        success: false,
        message:
          'No Slack search token for this turn. Slack only provides one when the user @mentions gorkie, so ask them to mention you and try again.',
      };
    }

    const res = searchResponse.parse(
      await slack.webClient.apiCall('assistant.search.context', {
        action_token: token,
        content_types: ['messages'],
        cursor,
        include_context_messages: true,
        limit: 10,
        query,
      })
    );
    if (!res.ok) {
      return {
        success: false,
        message: `Slack search failed for "${query}": ${res.error ?? 'unknown'}.`,
      };
    }

    const messages = res.results?.messages ?? [];
    return {
      success: true,
      messages,
      count: messages.length,
      nextCursor: res.response_metadata?.next_cursor || undefined,
      message: `Slack search found ${messages.length} message${messages.length === 1 ? '' : 's'} for "${query}".`,
    };
  },
});
