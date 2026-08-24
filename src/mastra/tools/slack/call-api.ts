import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { spendSlackCall } from '../../lib/slack-budget';
import { input, optionalCursor, output } from '../../types/tools/index';
import { getSandbox, sandboxPath as p } from '../../workspace';
import { assertReadableChannel, joinChannel } from './utils';

const readMethod =
  /^[a-z][\w.]*\.(accessLogs|all|billableInfo|context|conversations|counts|files|get|getPresence|history|identity|info|integrationLogs|list|lookup|lookupByEmail|members|messages|replies|test)$/;

const encodedId = /^slack:([A-Z0-9]+)(?::(\d{10}\.\d{6}))?$/;
const timestampParam = /^(ts|thread_ts|oldest|latest)$/;

const responseSchema = z.looseObject({
  ok: z.boolean(),
  error: z.string().optional(),
  response_metadata: z
    .looseObject({ next_cursor: z.string().optional() })
    .optional(),
});

const previewLimit = 16_384;

function slackParams(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      const encoded = typeof value === 'string' ? value.match(encodedId) : null;
      if (!encoded) {
        return [key, value];
      }
      return [
        key,
        timestampParam.test(key) ? (encoded[2] ?? value) : encoded[1],
      ];
    })
  );
}

export const callSlackApiTool = createTool({
  id: 'call_slack_api',
  description: `Call any read method of the Slack Web API directly and get its raw JSON response, for data the dedicated tools do not expose (reactions, pins, bookmarks, user groups, emoji, files, presence, team info, canvas sections).

Read methods only. Use this tool for one-off reads that dedicated tools do not expose. For pagination, filtering, joining, deduplication, sorting, counting, or aggregation across several calls, use Slack code mode instead. Allowed read segments are accessLogs, all, billableInfo, context, conversations, counts, files, get, getPresence, history, identity, info, integrationLogs, list, lookup, lookupByEmail, members, messages, replies, and test. Anything that posts, edits, deletes, joins, invites, or uploads is rejected. Use post_message, react, and upload_file for those.

Pass params exactly as Slack documents them, with raw ids (C..., U..., timestamps). slack:-prefixed ids are converted for you: slack:C123 becomes C123, and slack:C123:1712345678.000100 becomes C123, or the timestamp for ts, thread_ts, oldest, and latest. Public channels are joined automatically for conversations.* calls. Any params.channel must be the current conversation or a public channel; reading a DM or private channel gorkie is not currently in fails.

Responses are unshaped and can be large, so the full JSON is always written to a file in the thread sandbox and only a capped preview comes back. Read the file with read_file, or reduce it in Slack code mode, when the preview is truncated. Paginate with nextCursor. If truncated is true and no path came back, the sandbox was unavailable and the rest of the response was dropped, so narrow the request and call again.`,
  inputSchema: input({
    method: z
      .string()
      .min(1)
      .describe('Slack API method, e.g. "reactions.get" or "pins.list".'),
    params: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Method arguments as documented by Slack.'),
  }),
  outputSchema: output({
    ok: z.boolean(),
    error: z.string().optional(),
    path: z.string().optional(),
    size: z.number(),
    truncated: z.boolean(),
    preview: z.string(),
    nextCursor: optionalCursor,
  }),
  transform: {
    display: {
      output: ({ input: args }) => ({
        summary: `Called Slack API ${args?.method ?? ''}`,
      }),
    },
  },
  execute: async ({ method, params }, context) => {
    spendSlackCall(context?.requestContext);
    if (!readMethod.test(method)) {
      throw new Error(
        `${method} is not an allowed Slack read method. Use post_message, react, or upload_file to change anything in Slack.`
      );
    }

    const args = slackParams(params ?? {});
    if (typeof args.channel === 'string') {
      const ctx = channelContext(context?.requestContext);
      await assertReadableChannel({
        channelId: args.channel,
        currentThreadId: ctx.threadId,
      });
    }
    if (
      method.startsWith('conversations.') &&
      typeof args.channel === 'string'
    ) {
      await joinChannel(args.channel);
    }

    const response = responseSchema.parse(
      await slack.webClient.apiCall(method, args)
    );
    const body = JSON.stringify(response, null, 2);
    const truncated = body.length > previewLimit;

    let path: string | undefined;
    try {
      if (!context?.requestContext) {
        throw new Error('No workspace context.');
      }
      const sandbox = await getSandbox(context.requestContext);
      if (!sandbox) {
        throw new Error('No sandbox available.');
      }
      await sandbox.ensureRunning();
      const target = p('slack-api', `${method}-${Date.now()}.json`);
      await sandbox.retryOnDead(async () => {
        await sandbox.e2b.files.makeDir(p('slack-api'));
        await sandbox.e2b.files.write(target, body);
      });
      path = target;
    } catch {
      // The spilled copy is best effort. Dropping it keeps the capped preview
      // as the only thing that can reach the conversation, which is the point.
      path = undefined;
    }

    return {
      ok: response.ok,
      error: response.error,
      path,
      size: body.length,
      truncated,
      preview: truncated ? body.slice(0, previewLimit) : body,
      nextCursor: response.response_metadata?.next_cursor || undefined,
    };
  },
});
