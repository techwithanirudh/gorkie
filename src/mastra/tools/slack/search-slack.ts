import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { chat } from '../../chat/instance';
import { threadState } from '../../chat/state';
import { channelContext } from '../../lib/context';

function snippet(text: string, max = 600): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 3)}...`;
}

const contextMessage = z
  .looseObject({
    text: z.string().optional(),
    ts: z.string().optional(),
    user_id: z.string().optional(),
  })
  .transform((m) => ({ text: m.text ?? '', ts: m.ts, userId: m.user_id }));

const searchResponse = z.looseObject({
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
              permalink: z.string().optional(),
              team_id: z.string().optional(),
            })
            .transform((m) => ({
              author: m.author_name,
              userId: m.author_user_id,
              channelId: m.channel_id,
              channelName: m.channel_name,
              text: snippet(m.content ?? ''),
              before: (m.context_messages?.before ?? [])
                .slice(-3)
                .map((item) => snippet(item.text, 180)),
              after: (m.context_messages?.after ?? [])
                .slice(0, 3)
                .map((item) => snippet(item.text, 180)),
              permalink: m.permalink,
            }))
        )
        .optional(),
    })
    .optional(),
});

export const searchSlackTool = createTool({
  id: 'search_slack',
  description:
    'Search Slack messages for past conversations, decisions, links, people, or internal references outside the current thread. Use specific queries (keywords, names, channels, dates). For unfamiliar references and "what is X" questions, pair this with search_web and compare results before answering.',
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .max(500)
      .describe(
        'Slack search syntax (e.g. "deploy issue in:#eng", "from:alex budget"). For from:/to:, use the person\'s Slack username, NOT their raw user id (from:U0123ABCD will not match).'
      ),
    cursor: z
      .string()
      .optional()
      .describe('Cursor from a previous result page.'),
  }),
  execute: async ({ query, cursor }, context) => {
    const { threadId } = channelContext(context?.requestContext);
    const thread = threadId ? chat().thread(threadId) : undefined;
    const state = await threadState(thread);
    const token = state?.searchToken;
    if (!(thread && token)) {
      return {
        success: false,
        message:
          'No fresh Slack search token for this thread. Slack only provides a short-lived one when the user messages or @mentions gorkie, so ask them to mention you and try again.',
      };
    }

    let res: z.infer<typeof searchResponse>;
    try {
      res = searchResponse.parse(
        await slack.webClient.apiCall('assistant.search.context', {
          action_token: token,
          content_types: ['messages'],
          cursor,
          include_context_messages: true,
          limit: 10,
          query,
        })
      );
    } catch (error) {
      const reason = String(error);
      if (
        reason.includes('invalid_action_token') ||
        reason.includes('token_expired')
      ) {
        await thread.setState({ searchToken: undefined });
        return {
          success: false,
          message:
            'The Slack search token for this thread expired. Ask the @mention gorkie in a new message, then search again.',
        };
      }
      throw error;
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
