import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '@/env';
import { slack } from '../../chat/client';
import { chat } from '../../chat/instance';
import { threadState } from '../../chat/state';
import { channelContext } from '../../lib/context';
import { chatChannelId } from '../../lib/ids';
import { spendSlackCall } from '../../lib/slack-budget';
import { input, output } from '../../types/tools/index';

const identitySchema = z.enum(['requester', 'workspace']);

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
              text: (message.content ?? '').slice(0, 1200),
              before: (message.context_messages?.before ?? []).slice(-3),
              after: (message.context_messages?.after ?? []).slice(0, 3),
              permalink: message.permalink,
            }))
        )
        .optional(),
    })
    .optional(),
});

const authTestSchema = z.looseObject({
  response_metadata: z
    .looseObject({ scopes: z.array(z.string()).optional() })
    .optional(),
});

const slackErrorSchema = z.looseObject({
  data: z.looseObject({ error: z.string().optional() }).optional(),
});

type SearchResponse = z.infer<typeof searchResponseSchema>;

let verifiedFallbackToken: string | undefined;

/**
 * Verify that the configured fallback search token is scoped to public
 * channels only, refusing to run a workspace search with a token that can
 * read DMs or private channels. Checks once per process and token.
 */
async function assertPublicOnlyFallback(token: string): Promise<void> {
  if (verifiedFallbackToken === token) {
    return;
  }
  const auth = authTestSchema.parse(
    await slack.webClient.apiCall('auth.test', { token })
  );
  const scopes = auth.response_metadata?.scopes;
  if (!scopes) {
    throw new Error(
      'Slack did not report the scopes on SLACK_SEARCH_USER_TOKEN, so gorkie cannot confirm it is limited to public channels. Workspace search is disabled until it can.'
    );
  }
  const overreach = scopes.filter((scope) =>
    ['search:read.im', 'search:read.mpim', 'search:read.private'].includes(
      scope
    )
  );
  if (overreach.length > 0) {
    throw new Error(
      `SLACK_SEARCH_USER_TOKEN grants ${overreach.join(', ')}, which can read DMs and private channels. Reissue it with search:read.public only.`
    );
  }
  if (!scopes.includes('search:read.public')) {
    throw new Error(
      'SLACK_SEARCH_USER_TOKEN is missing search:read.public, so workspace search would only fail later. Reissue it with search:read.public.'
    );
  }
  verifiedFallbackToken = token;
}

/**
 * Run one assistant.search.context call against Slack, pinned to public
 * channels and message content, and return the parsed response page.
 */
async function runSearch({
  actionToken,
  cursor,
  query,
  token,
}: {
  actionToken?: string;
  cursor?: string;
  query: string;
  token: string;
}): Promise<SearchResponse> {
  return searchResponseSchema.parse(
    await slack.webClient.apiCall('assistant.search.context', {
      action_token: actionToken,
      // Slack reads these as comma-separated strings. WebClient JSON-encodes an
      // array, which Slack then ignores, and an ignored channel_types silently
      // reopens DMs and private channels to whatever the token can reach.
      channel_types: 'public_channel',
      content_types: 'messages',
      cursor,
      include_context_messages: true,
      limit: 10,
      query,
      token,
    })
  );
}

/**
 * Reduce a raw search page to messages in channels gorkie can confirm are
 * workspace-visible right now, trim context text, and stamp the next cursor
 * with the identity that produced the page.
 */
async function toOutput({
  response,
  searchedAs,
  threadId,
}: {
  response: SearchResponse;
  searchedAs: z.infer<typeof identitySchema>;
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

  const lookupVisibility = async (channelId: string) => {
    if (threadId && channelId === chatChannelId(threadId)) {
      return channelId;
    }
    try {
      const metadata = await chat().channel(channelId).fetchMetadata();
      return metadata.channelVisibility === 'workspace' ? channelId : undefined;
    } catch (error) {
      // A channel gorkie cannot look up is not readable. Anything else, a
      // rate limit above all, has to fail the search instead of quietly
      // shrinking it into a confident "nothing found".
      const parsed = slackErrorSchema.safeParse(error);
      if (parsed.success && parsed.data.data?.error === 'channel_not_found') {
        return;
      }
      throw error;
    }
  };
  // Bounded in small batches: one unbounded Promise.all can fire enough
  // parallel fetchMetadata calls to trip Slack rate limits. No caching, on
  // purpose - visibility is the privacy gate for these results, and a stale
  // "workspace" entry would leak a channel that later went private.
  const visibilityBatchSize = 4;
  const ids = [...channelIds];
  const resolved: Array<string | undefined> = [];
  for (let index = 0; index < ids.length; index += visibilityBatchSize) {
    resolved.push(
      // biome-ignore lint/performance/noAwaitInLoops: batches are sequential on purpose - that is what bounds the concurrency.
      ...(await Promise.all(
        ids.slice(index, index + visibilityBatchSize).map(lookupVisibility)
      ))
    );
  }
  const readable = new Set(
    resolved.filter((channelId) => channelId !== undefined)
  );

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
    nextCursor: response.response_metadata?.next_cursor
      ? `${searchedAs}:${response.response_metadata.next_cursor}`
      : undefined,
    searchedAs,
  };
}

/**
 * Search through the workspace-wide public identity. Requires a live message
 * in the thread (the borrowed identity never runs on scheduled or unattended
 * turns) and a fallback token that passes the public-scope check.
 */
async function workspaceSearch({
  cursor,
  messageId,
  query,
  threadId,
  token,
}: {
  cursor?: string;
  messageId?: string;
  query: string;
  threadId?: string;
  token: string;
}) {
  // The workspace token searches as a real person, so it only runs while a
  // live message puts someone in the turn. Scheduled and App Home runs must
  // never borrow that identity.
  if (!messageId) {
    throw new Error(
      'Slack search needs a live message in this thread. gorkie does not borrow the workspace search identity on scheduled or unattended runs. Ask the user to mention the bot, then search again.'
    );
  }
  await assertPublicOnlyFallback(token);
  return toOutput({
    response: await runSearch({ cursor, query, token }),
    searchedAs: 'workspace',
    threadId,
  });
}

export const searchSlackTool = createTool({
  id: 'search_slack',
  description:
    'Run one Slack message search for past conversations, decisions, links, people, or internal references. Use Slack search syntax to narrow by keywords, names, channels, senders, or dates. Public channels only: DMs, private channels, and Slack Connect conversations are never searched. This returns one result page with short surrounding context. Use Slack code mode when the task needs multiple queries, exhaustive pagination, filtering, aggregation, or full conversation reads. Search normally runs as the person who mentioned the bot, and falls back to a workspace-wide public search when that token expires, so it needs a live message in the thread either way.',
  inputSchema: input({
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
  outputSchema: output({
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
    searchedAs: identitySchema.describe(
      'Whose view produced these results: the person who mentioned the bot, or the workspace-wide public search identity.'
    ),
  }),
  transform: {
    display: {
      output: ({ input: args, output: result }) => ({
        summary: `Found ${result?.messages.length ?? 0} Slack messages for "${args?.query ?? ''}"`,
      }),
    },
  },
  /**
   * Run the search as the person who mentioned the bot while their search
   * token is live, keeping pagination pinned to the identity that issued the
   * cursor and falling back to the workspace identity when the token expires.
   */
  execute: async ({ query, cursor }, context) => {
    spendSlackCall(context?.requestContext);
    const { messageId, threadId } = channelContext(context?.requestContext);
    const thread = threadId ? chat().thread(threadId) : undefined;
    const actionToken = (await threadState(thread))?.searchToken;
    const fallbackToken = env.SLACK_SEARCH_USER_TOKEN;

    const separator = cursor ? cursor.indexOf(':') : -1;
    const pinned = cursor
      ? identitySchema.safeParse(
          separator > 0 ? cursor.slice(0, separator) : ''
        )
      : undefined;
    if (cursor && !pinned?.success) {
      throw new Error(
        'That cursor did not come from search_slack. Run the search again without a cursor.'
      );
    }
    // A cursor is only meaningful to the identity that issued it, so pagination
    // stays pinned to that identity instead of silently resuming as someone else.
    const identity = pinned?.success ? pinned.data : undefined;
    const slackCursor = cursor?.slice(separator + 1);

    if (identity === 'workspace') {
      return workspaceSearch({
        cursor: slackCursor,
        messageId,
        query,
        threadId,
        token: fallbackToken,
      });
    }

    if (!(thread && actionToken)) {
      if (identity) {
        throw new Error(
          'The Slack search token behind that result page expired. Run the search again without a cursor.'
        );
      }
      return workspaceSearch({
        messageId,
        query,
        threadId,
        token: fallbackToken,
      });
    }

    try {
      return await toOutput({
        response: await runSearch({
          actionToken,
          cursor: slackCursor,
          query,
          token: env.SLACK_BOT_TOKEN,
        }),
        searchedAs: 'requester',
        threadId,
      });
    } catch (error) {
      const parsed = slackErrorSchema.safeParse(error);
      const code = parsed.success ? parsed.data.data?.error : undefined;
      const reason = String(error);
      const tokenFailure =
        code === 'invalid_action_token' ||
        code === 'token_expired' ||
        reason.includes('invalid_action_token') ||
        reason.includes('token_expired');
      if (!tokenFailure) {
        throw error;
      }
      await thread.setState({ searchToken: undefined });
      if (cursor) {
        throw new Error(
          'The Slack search token expired part way through this result set. Run the search again without a cursor.',
          { cause: error }
        );
      }
      return workspaceSearch({
        messageId,
        query,
        threadId,
        token: fallbackToken,
      });
    }
  },
});
