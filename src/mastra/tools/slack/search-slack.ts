import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '@/env';
import { slack } from '../../chat/client';
import { search } from '../../config';
import { channelContext } from '../../lib/context';
import { chatChannelId } from '../../lib/ids';
import { spendSlackCall } from '../../lib/slack-budget';
import { readableChannelIds } from './utils';

const contextMessageSchema = z
  .looseObject({
    channel_id: z.string().optional(),
    text: z.string().optional(),
    ts: z.string().optional(),
    user_id: z.string().optional(),
  })
  .transform((message) => ({
    text: message.text ?? '',
    ts: message.ts,
    userId: message.user_id,
    channelId: message.channel_id
      ? chatChannelId(message.channel_id)
      : undefined,
  }));

const searchResponseSchema = z.looseObject({
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
                  after: z.array(contextMessageSchema).optional(),
                  before: z.array(contextMessageSchema).optional(),
                })
                .optional(),
              permalink: z.string().optional(),
              team_id: z.string().optional(),
            })
            .transform((message) => ({
              author: message.author_name,
              userId: message.author_user_id,
              channelId: message.channel_id
                ? chatChannelId(message.channel_id)
                : undefined,
              channelName: message.channel_name,
              text: (message.content ?? '').slice(0, search.snippetChars),
              before: (message.context_messages?.before ?? []).slice(-3),
              after: (message.context_messages?.after ?? []).slice(0, 3),
              permalink: message.permalink,
            }))
        )
        .optional(),
    })
    .optional(),
});

type SearchResponse = z.infer<typeof searchResponseSchema>;

let verifiedToken: string | undefined;

async function assertPublicOnly(token: string): Promise<void> {
  if (verifiedToken === token) {
    return;
  }
  const scopes = (await slack.webClient.auth.test({ token })).response_metadata
    ?.scopes;
  if (!scopes) {
    throw new Error(
      'Slack did not report the scopes on SLACK_USER_TOKEN, so gorkie cannot confirm it is limited to public channels. Workspace search is disabled until it can.'
    );
  }
  const overreach = scopes.filter((scope) =>
    ['search:read.im', 'search:read.mpim', 'search:read.private'].includes(
      scope
    )
  );
  if (overreach.length > 0) {
    throw new Error(
      `SLACK_USER_TOKEN grants ${overreach.join(', ')}, which can read DMs and private channels. Reissue it with search:read.public only.`
    );
  }
  if (!scopes.includes('search:read.public')) {
    throw new Error(
      'SLACK_USER_TOKEN is missing search:read.public, so workspace search would only fail later. Reissue it with search:read.public.'
    );
  }
  verifiedToken = token;
}

async function toOutput({
  response,
  threadId,
}: {
  response: SearchResponse;
  threadId?: string;
}) {
  const messages = response.results?.messages ?? [];
  const channelIds = new Set<string>();
  for (const message of messages) {
    if (message.channelId) {
      channelIds.add(message.channelId);
    }
    for (const item of [...message.before, ...message.after]) {
      const channelId = item.channelId ?? message.channelId;
      if (channelId) {
        channelIds.add(channelId);
      }
    }
  }

  const readable = await readableChannelIds({
    channelIds: [...channelIds],
    currentThreadId: threadId,
  });

  return {
    messages: messages.flatMap((message) => {
      const { channelId } = message;
      if (!(channelId && readable.has(channelId))) {
        return [];
      }
      const contextText = (items: typeof message.before) =>
        items
          .filter((item) => readable.has(item.channelId ?? channelId))
          .map((item) => item.text.slice(0, 400));
      return [
        {
          ...message,
          before: contextText(message.before),
          after: contextText(message.after),
        },
      ];
    }),
    nextCursor: response.response_metadata?.next_cursor,
  };
}

export const searchSlackTool = createTool({
  id: 'search_slack',
  description:
    'Run one Slack message search for past conversations, decisions, links, people, or internal references. Use Slack search syntax to narrow by keywords, names, channels, senders, or dates. Public channels only: DMs, private channels, and Slack Connect conversations are never searched. This returns one result page with short surrounding context; pass the returned cursor back to page through more matches. Use Slack code mode when the task needs multiple queries, exhaustive pagination, filtering, aggregation, or full conversation reads.',
  inputSchema: z.strictObject({
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
      .describe('Cursor from a previous result page, passed back unchanged.'),
  }),
  outputSchema: z.strictObject({
    messages: z.array(
      z.strictObject({
        author: z.string().optional(),
        userId: z.string().optional(),
        channelId: z.string().optional(),
        channelName: z.string().optional(),
        text: z.string(),
        before: z.array(z.string()),
        after: z.array(z.string()),
        permalink: z.string().optional(),
      })
    ),
    nextCursor: z.string().optional(),
  }),
  transform: {
    display: {
      output: ({ input: args, output: result }) => ({
        summary: `Found ${result?.messages.length ?? 0} Slack messages for "${args?.query ?? ''}"`,
      }),
    },
  },
  execute: async ({ query, cursor }, context) => {
    spendSlackCall(context.requestContext);
    const { threadId } = channelContext(context.requestContext);
    const token = env.SLACK_USER_TOKEN;
    await assertPublicOnly(token);
    return toOutput({
      response: searchResponseSchema.parse(
        await slack.webClient.apiCall('assistant.search.context', {
          // Must be a comma-separated string: Slack ignores an array, which reopens private channels and DMs.
          channel_types: 'public_channel',
          content_types: 'messages',
          cursor,
          include_context_messages: true,
          limit: 10,
          query,
          token,
        })
      ),
      threadId,
    });
  },
});
