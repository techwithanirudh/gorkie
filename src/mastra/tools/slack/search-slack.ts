import { createTool } from '@mastra/core/tools';
import { WebClient } from '@slack/web-api';
import { z } from 'zod';
import { env } from '@/env';
import { channelContext } from '../../lib/context';
import { chatChannelId, rawId } from '../../lib/ids';
import { assertWithinLimit } from '../../lib/limits';
import { slackWebLogger } from '../../lib/logger/slack';
import { spendSlackCall } from '../../lib/slack-budget';
import { slackError } from '../../lib/slack-error';
import { input, output } from '../../types/tools/index';

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

const rateLimitSchema = z.looseObject({
  retryAfter: z.number().optional(),
});

// On a 429 the shared client pauses its whole queue for Slack's retry-after, so
// one search stalls every Slack call in the process for minutes. This client
// rejects a 429 at once and retries only network errors and 5xx responses.
const searchClient = new WebClient(undefined, {
  logger: slackWebLogger,
  rejectRateLimitedCalls: true,
  retryConfig: { retries: 2, factor: 2 },
  timeout: 15_000,
});

function searchFailure(error: unknown): Error {
  const parsed = rateLimitSchema.safeParse(error);
  if (parsed.data?.retryAfter !== undefined) {
    return new Error(
      `Slack rate limited search for ${Math.ceil(parsed.data.retryAfter / 60)} more minutes, so no search ran. Do not search again. Answer from what you already have, and tell the person search is unavailable for now.`,
      { cause: error }
    );
  }
  const code = slackError(error);
  if (!code) {
    return new Error(
      'Slack search failed. No results were returned to the model. Do not treat this as an empty search or retry with another token.',
      { cause: error }
    );
  }
  const reasons: Record<string, string> = {
    access_denied: 'Slack denied access to the requested resource.',
    assistant_search_context_disabled:
      'Slack has disabled assistant search context. This does not establish whether the cause is an AI access setting or a temporary Slack issue.',
    context_channel_not_found:
      'The search context channel does not exist or the searching identity cannot access it.',
    ekm_access_denied: 'Slack denied access under its encryption policy.',
    enterprise_is_restricted:
      'Slack restricted access for this Enterprise organization.',
    missing_scope: 'The search token lacks a required Slack scope.',
    token_expired: 'The Slack search token has expired.',
    invalid_auth: 'Slack rejected the search token.',
    ratelimited: 'Slack rate limited the search.',
  };
  const reason = reasons[code] ?? 'Slack rejected the search request.';
  return new Error(
    `Slack search failed (${code}): ${reason} No results were returned to the model. Do not treat this as an empty search, claim no matching messages exist, or bypass Slack AI access controls with another token.`,
    { cause: error }
  );
}

type SearchResponse = z.infer<typeof searchResponseSchema>;

let verifiedToken: string | undefined;

async function assertPublicOnly(token: string): Promise<void> {
  if (verifiedToken === token) {
    return;
  }
  const auth = authTestSchema.parse(
    await searchClient.apiCall('auth.test', { token })
  );
  const scopes = auth.response_metadata?.scopes;
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

async function runSearch({
  channelId,
  cursor,
  query,
  token,
}: {
  channelId: string;
  cursor?: string;
  query: string;
  token: string;
}): Promise<SearchResponse> {
  try {
    return searchResponseSchema.parse(
      await searchClient.apiCall('assistant.search.context', {
        // Keep the originating channel attached when searching with a user
        // token, so Slack can enforce access controls in that context.
        context_channel_id: rawId(channelId),
        // Slack expects comma-separated strings, not JSON-encoded arrays.
        channel_types: 'public_channel',
        content_types: 'messages',
        cursor,
        include_context_messages: true,
        limit: 10,
        query,
        token,
      })
    );
  } catch (error) {
    throw searchFailure(error);
  }
}

async function toOutput({
  response,
  threadId,
}: {
  response: SearchResponse;
  threadId?: string;
}) {
  const messages = (response.results?.messages ?? []).filter(
    ({ channelId }) =>
      !(channelId && env.BLOCKED_CHANNELS.includes(rawId(channelId)))
  );
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
      const { channel } = await searchClient.conversations.info({
        channel: rawId(channelId),
        token: env.SLACK_BOT_TOKEN,
      });
      // The rule the Slack adapter's fetchChannelInfo uses for "workspace".
      const shared = !(
        channel?.is_ext_shared ||
        channel?.is_im ||
        channel?.is_mpim ||
        channel?.is_private
      );
      return shared && rawId(channelId).startsWith('C') ? channelId : undefined;
    } catch (error) {
      // A rate limit has to fail the search, not shrink it into "nothing found".
      if (slackError(error) === 'channel_not_found') {
        return;
      }
      throw searchFailure(error);
    }
  };
  // Unbounded parallel conversations.info calls trip Slack rate limits. Not
  // cached: a stale "workspace" entry would leak a channel that went private.
  const visibilityBatchSize = 4;
  const ids = [...channelIds];
  const resolved: Array<string | undefined> = [];
  for (let index = 0; index < ids.length; index += visibilityBatchSize) {
    resolved.push(
      // biome-ignore lint/performance/noAwaitInLoops: sequential batches are what bound the concurrency.
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
    nextCursor: response.response_metadata?.next_cursor,
  };
}

export const searchSlackTool = createTool({
  id: 'search_slack',
  description:
    'Run one Slack message search for past conversations, decisions, links, people, or internal references. Use Slack search syntax to narrow by keywords, names, channels, senders, or dates. Public channels only: DMs, private channels, and Slack Connect conversations are never searched. This returns one result page with short surrounding context. Use Slack code mode when the task needs multiple queries, exhaustive pagination, filtering, aggregation, or full conversation reads. Search runs as the workspace-wide public identity, so it needs a live message in the thread and never runs on scheduled or unattended turns.',
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
  }),
  transform: {
    display: {
      output: ({ input: args, output: result }) => ({
        summary: `Found ${result?.messages.length ?? 0} Slack messages for "${args?.query ?? ''}"`,
      }),
    },
  },
  execute: async ({ query, cursor }, context) => {
    spendSlackCall(context?.requestContext);
    await assertWithinLimit({
      kind: 'slackSearch',
      requestContext: context?.requestContext,
    });
    const { channelId, messageId, threadId } = channelContext(
      context?.requestContext
    );
    const searchChannelId = channelId ?? threadId;
    if (!(messageId && searchChannelId)) {
      throw new Error(
        'Slack search needs a live message in this thread. gorkie does not run the workspace search identity on scheduled or unattended runs. Ask the user to mention the bot, then search again.'
      );
    }
    const token = env.SLACK_USER_TOKEN;
    await assertPublicOnly(token);
    return toOutput({
      response: await runSearch({
        channelId: searchChannelId,
        cursor,
        query,
        token,
      }),
      threadId,
    });
  },
});
