import type { RequestContext } from '@mastra/core/request-context';
import { createTool } from '@mastra/core/tools';
import { ErrorCode, WebClientEvent } from '@slack/web-api';
import { z } from 'zod';
import { env } from '@/env';
import { slack } from '../../chat/client';
import { search } from '../../config';
import { channelContext } from '../../lib/context';
import { parseSlackInput } from '../../lib/ids';
import type { ChannelContext } from '../../types';
import { readableChannels } from './access';
import { spendSlackCall } from './budget';

const retryAt = new Map<string, number>();

slack.webClient.on(
  WebClientEvent.RATE_LIMITED,
  (
    seconds: number,
    { url, body }: { url: string; body: { token?: string } }
  ) => {
    if (url.endsWith('/assistant.search.context') && body.token) {
      retryAt.set(
        body.token,
        Math.max(retryAt.get(body.token) ?? 0, Date.now() + seconds * 1000)
      );
    }
  }
);

function searchCooldownError({
  token,
  cause,
}: {
  token: string;
  cause?: unknown;
}): Error {
  const seconds = Math.max(
    0,
    Math.ceil(((retryAt.get(token) ?? 0) - Date.now()) / 1000)
  );
  return new Error(
    `Slack search is unavailable for ${seconds} seconds due to rate limiting. Do not retry searches during this cooldown. Use the evidence already gathered and report what could not be verified.`,
    { cause }
  );
}

const slackErrorSchema = z.looseObject({
  data: z.looseObject({ error: z.string().optional() }).optional(),
});

function searchFailure(error: unknown): Error {
  const code = slackErrorSchema.safeParse(error).data?.data?.error;
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
    channelId: message.channel_id,
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
              channelId: message.channel_id,
              channelName: message.channel_name,
              text: (message.content ?? '').slice(0, search.snippetChars),
              before: (message.context_messages?.before ?? []).slice(
                -search.contextMessages
              ),
              after: (message.context_messages?.after ?? []).slice(
                0,
                search.contextMessages
              ),
              permalink: message.permalink,
            }))
        )
        .optional(),
    })
    .optional(),
});

type SearchResponse = z.infer<typeof searchResponseSchema>;

const verifiedTokens = new Set<string>();

async function assertPublicOnly({
  token,
  credential,
}: {
  token: string;
  credential: string;
}): Promise<void> {
  if (verifiedTokens.has(token)) {
    return;
  }
  const scopes = (await slack.webClient.auth.test({ token })).response_metadata
    ?.scopes;
  if (!scopes) {
    throw new Error(
      `Slack did not report the scopes on ${credential}, so gorkie cannot confirm public-only search access. Workspace search is disabled until it can.`
    );
  }
  const overreach = scopes.filter((scope) =>
    [
      'search:read',
      'search:read.im',
      'search:read.mpim',
      'search:read.private',
    ].includes(scope)
  );
  if (overreach.length > 0) {
    throw new Error(
      `${credential} grants ${overreach.join(', ')}, which can search DMs and private channels. Reissue it with search:read.public only.`
    );
  }
  if (!scopes.includes('search:read.public')) {
    throw new Error(
      `${credential} is missing search:read.public. Grant that public-only scope and reinstall the Slack app to enable search with this credential.`
    );
  }
  verifiedTokens.add(token);
}

async function toOutput({
  response,
  ctx,
}: {
  response: SearchResponse;
  ctx: ChannelContext;
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

  const readable = await readableChannels({
    channelIds: [...channelIds],
    ctx,
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
          .map((item) => item.text.slice(0, search.contextSnippetChars));
      return [
        {
          ...message,
          channelId: slack.channelIdFromThreadId(
            slack.encodeThreadId({ channel: channelId, threadTs: '' })
          ),
          before: contextText(message.before),
          after: contextText(message.after),
        },
      ];
    }),
    nextCursor: response.response_metadata?.next_cursor,
  };
}

async function searchMessages(
  { query, cursor }: { query: string; cursor?: string },
  context: { requestContext?: RequestContext }
) {
  const ctx = channelContext(context.requestContext);
  const contextChannel = parseSlackInput(ctx.channelId ?? ctx.threadId).channel;
  const actionToken = z
    .string()
    .min(1)
    .safeParse(context.requestContext?.get('slackSearchActionToken')).data;
  const botPage = cursor?.startsWith('bot:') === true;
  const credentials = botPage
    ? [
        {
          token: env.SLACK_BOT_TOKEN,
          name: 'SLACK_BOT_TOKEN',
          cursor: cursor?.slice(4),
          bot: true,
        },
      ]
    : [
        {
          token: env.SLACK_USER_TOKEN,
          name: 'SLACK_USER_TOKEN',
          cursor,
          bot: false,
        },
        ...(cursor
          ? []
          : [
              {
                token: env.SLACK_BOT_TOKEN,
                name: 'SLACK_BOT_TOKEN',
                cursor: undefined,
                bot: true,
              },
            ]),
      ];
  for (const [index, credential] of credentials.entries()) {
    const { token } = credential;
    if ((retryAt.get(token) ?? 0) > Date.now()) {
      if (index < credentials.length - 1) {
        continue;
      }
      throw searchCooldownError({ token });
    }
    if (credential.bot && !actionToken) {
      throw new Error(
        'Public bot search needs the action token from a current Slack mention or DM. Ask the user to mention gorkie or send a new DM, then search again.'
      );
    }
    // biome-ignore lint/performance/noAwaitInLoops: credentials are attempted only after the previous search is rate limited.
    await assertPublicOnly({ token, credential: credential.name });
    spendSlackCall(context.requestContext);
    try {
      const response = searchResponseSchema.parse(
        await slack.webClient.apiCall('assistant.search.context', {
          // Must be a comma-separated string: Slack ignores an array, which reopens private channels and DMs.
          ...(credential.bot ? { action_token: actionToken } : {}),
          ...(!credential.bot && contextChannel
            ? { context_channel_id: contextChannel }
            : {}),
          channel_types: 'public_channel',
          content_types: 'messages',
          cursor: credential.cursor,
          include_context_messages: true,
          limit: search.slackPageSize,
          query,
          token,
        })
      );
      const output = await toOutput({ response, ctx });
      return {
        ...output,
        nextCursor:
          credential.bot && output.nextCursor
            ? `bot:${output.nextCursor}`
            : output.nextCursor,
      };
    } catch (error) {
      const limited = z
        .looseObject({
          code: z.literal(ErrorCode.RateLimitedError),
          retryAfter: z.number(),
        })
        .safeParse(error);
      if (!limited.success) {
        throw searchFailure(error);
      }
      retryAt.set(
        token,
        Math.max(
          retryAt.get(token) ?? 0,
          Date.now() + limited.data.retryAfter * 1000
        )
      );
      if (index === credentials.length - 1) {
        throw searchCooldownError({ token, cause: error });
      }
    }
  }
  throw new Error('No Slack search credential was available.');
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
  execute: searchMessages,
});
