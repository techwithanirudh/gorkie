import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { slack as slackConfig } from '../../config';
import { channelContext } from '../../lib/context';
import { parseSlackId, rawId } from '../../lib/ids';
import { logger } from '../../lib/logger';
import { spendSlackCall } from '../../lib/slack-budget';
import {
  sandboxPath as p,
  requireSandbox,
  writeSandboxFile,
} from '../../workspace';
import { assertReadableChannel, joinChannel } from './utils';

const slackId = z.string().min(1).transform(rawId);
const slackTs = z
  .string()
  .min(1)
  .transform((value) => parseSlackId({ input: value }).ts ?? value);

const methods = new Map<
  string,
  { params: z.ZodType<Record<string, unknown>>; channelParam?: string }
>([
  [
    'reactions.get',
    {
      params: z.strictObject({
        channel: slackId,
        timestamp: slackTs,
        full: z.boolean().optional(),
      }),
      channelParam: 'channel',
    },
  ],
  [
    'pins.list',
    { params: z.strictObject({ channel: slackId }), channelParam: 'channel' },
  ],
  [
    'bookmarks.list',
    {
      params: z.strictObject({ channel_id: slackId }),
      channelParam: 'channel_id',
    },
  ],
  [
    'usergroups.list',
    {
      params: z.strictObject({
        include_count: z.boolean().optional(),
        include_disabled: z.boolean().optional(),
        include_users: z.boolean().optional(),
      }),
    },
  ],
  [
    'usergroups.users.list',
    {
      params: z.strictObject({
        usergroup: z.string().min(1),
        include_disabled: z.boolean().optional(),
      }),
    },
  ],
  ['users.getPresence', { params: z.strictObject({ user: slackId }) }],
  ['team.info', { params: z.strictObject({}) }],
  [
    'emoji.list',
    {
      params: z.strictObject({ include_categories: z.boolean().optional() }),
    },
  ],
]);

const authParams = new Set(['token', 'as_user', 'client_id', 'client_secret']);

export const callSlackApiTool = createTool({
  id: 'call_slack_api',
  description: `Call one of a fixed set of read-only Slack Web API methods and get its raw JSON, for data the dedicated tools do not expose. Allowed methods and their params:
- reactions.get: channel, timestamp, full. Reactions on one message.
- pins.list: channel. Pinned items in a channel.
- bookmarks.list: channel_id. Bookmarks in a channel.
- usergroups.list: include_count, include_disabled, include_users.
- usergroups.users.list: usergroup (S...), include_disabled.
- users.getPresence: user (U...).
- team.info: no params.
- emoji.list: include_categories.
Any other method or param is refused, and never pass a token. Channel params must be the current conversation or a public channel; slack: ids are accepted and converted. For loops, joins, or counting across several calls, use Slack code mode instead.

Responses can be large, so the full JSON is written to a file in the thread sandbox and only a capped preview comes back. Read the file with read_file when the preview is truncated. If truncated is true and no path came back, the sandbox was unavailable, so narrow the request and call again.`,
  inputSchema: z.strictObject({
    method: z.string().min(1).describe('Slack API method, e.g. "pins.list".'),
    params: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Method arguments as documented by Slack.'),
  }),
  outputSchema: z.strictObject({
    ok: z.boolean(),
    path: z.string().optional(),
    size: z.number(),
    truncated: z.boolean(),
    preview: z.string(),
    nextCursor: z.string().optional(),
  }),
  transform: {
    display: {
      output: ({ input }) => ({
        summary: `Called Slack API ${input?.method ?? ''}`,
      }),
    },
  },
  execute: async ({ method, params = {} }, context) => {
    const allowed = methods.get(method);
    if (!allowed) {
      throw new Error(
        `${method} is not an allowed Slack method. Allowed: ${[...methods.keys()].join(', ')}.`
      );
    }
    const auth = Object.keys(params).filter((key) => authParams.has(key));
    if (auth.length > 0) {
      throw new Error(
        `Remove ${auth.join(', ')}: calls always run as gorkie and never take caller credentials.`
      );
    }
    const parsed = allowed.params.safeParse(params);
    if (!parsed.success) {
      throw new Error(
        `Bad params for ${method}: ${z.prettifyError(parsed.error)}`
      );
    }
    const args = parsed.data;
    const channel = allowed.channelParam && args[allowed.channelParam];
    if (typeof channel === 'string') {
      await assertReadableChannel({
        channelId: channel,
        currentThreadId: channelContext(context.requestContext).threadId,
      });
      await joinChannel(channel);
    }
    spendSlackCall(context.requestContext);

    // apiCall throws on ok: false, so a returned body is always a success.
    const response = await slack.webClient.apiCall(method, args);
    const body = JSON.stringify(response, null, 2);
    const truncated = body.length > slackConfig.apiPreviewChars;
    let path: string | undefined;
    if (truncated) {
      try {
        const sandbox = await requireSandbox(context.requestContext);
        const target = p('slack-api', `${method}-${Date.now()}.json`);
        await writeSandboxFile({ data: body, path: target, sandbox });
        path = target;
      } catch (error) {
        logger.debug('[call_slack_api] could not save the full response', {
          error,
          method,
        });
      }
    }

    return {
      ok: response.ok,
      path,
      size: body.length,
      truncated,
      preview: truncated ? body.slice(0, slackConfig.apiPreviewChars) : body,
      nextCursor: response.response_metadata?.next_cursor || undefined,
    };
  },
});
