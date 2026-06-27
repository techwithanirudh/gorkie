import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../channels/slack';
import { getSearchToken } from '../channels/search-token';
import { channelContext } from '../types';

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
          z.looseObject({
            author_name: z.string().optional(),
            author_user_id: z.string().optional(),
            channel_id: z.string().optional(),
            channel_name: z.string().optional(),
            content: z.string().optional(),
            message_ts: z.string().optional(),
            permalink: z.string().optional(),
          }),
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
    cursor: z.string().optional().describe('Cursor from a previous result page.'),
  }),
  execute: async ({ query, cursor }, context) => {
    const threadId = channelContext(context?.requestContext).threadId;
    const token = threadId ? getSearchToken(threadId) : undefined;
    if (!token) {
      return {
        ok: false,
        error:
          'No Slack search token for this thread. Slack only provides one when the user @mentions gorkie, so ask them to mention you and try again.',
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
      }),
    );
    if (!res.ok) {
      return { ok: false, error: `Slack search failed: ${res.error ?? 'unknown'}` };
    }

    const messages = res.results?.messages ?? [];
    return {
      ok: true,
      messages: messages.map((m) => ({
        author: m.author_name,
        userId: m.author_user_id,
        channelId: m.channel_id,
        channelName: m.channel_name,
        text: m.content,
        ts: m.message_ts,
        permalink: m.permalink,
      })),
      nextCursor: res.response_metadata?.next_cursor || undefined,
    };
  },
});
