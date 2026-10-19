import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '@/env';
import { slack } from '../chat/client';
import { huddleFm } from '../config';
import { channelContext } from '../lib/context';
import { parseSlackInput } from '../lib/ids';
import {
  huddleCommandSchema,
  huddleMessageSchema,
  huddleReplySchema,
} from '../types/tools/huddlefm';
import { spendSlackCall } from './slack/budget';

export const huddleDjTool = createTool({
  id: 'huddle_dj',
  description:
    'Send one HuddleFM music command for the current Slack channel. request_control asks the huddle host for permission; other commands need their grant. Returns a command timestamp, not confirmation. Read huddlefm skill first and use huddle_dj_reply to check the result.',
  inputSchema: huddleCommandSchema,
  outputSchema: z.strictObject({
    commandTs: z.string(),
    state: z.literal('pending'),
  }),
  transform: {
    display: {
      output: ({ input }) => ({
        summary: `Requested HuddleFM ${input?.type ?? 'music change'}`,
      }),
    },
  },
  execute: async (command, context) => {
    const ctx = channelContext(context.requestContext);
    const { channel } = parseSlackInput(ctx.channelId ?? ctx.threadId);
    if (!channel || ctx.isDM || !ctx.userId) {
      throw new Error('Ask from the Slack channel containing the huddle.');
    }
    if (!env.HUDDLEFM_USER_ID) {
      throw new Error('HuddleFM is not configured on this deployment.');
    }
    context.abortSignal?.throwIfAborted();
    spendSlackCall(context.requestContext);
    const dm = await slack.webClient.conversations.open({
      users: env.HUDDLEFM_USER_ID,
    });
    if (!dm.channel?.id) {
      throw new Error('Could not open the HuddleFM integration conversation.');
    }
    const text = JSON.stringify({
      v: 1,
      ...command,
      channel,
      ...(command.type === 'request_control'
        ? {
            permissions: [
              'add',
              'add-bulk',
              'remove-own',
              'manage-queue',
              'skip',
              'pause',
              'volume',
              'clear',
            ],
            events: [],
          }
        : {}),
    })
      .replace(/[&<>]/g, (value) => `\\u00${value.charCodeAt(0).toString(16)}`)
      .replace(/\//g, '\\/');
    context.abortSignal?.throwIfAborted();
    spendSlackCall(context.requestContext);
    const posted = await slack.webClient.chat.postMessage({
      channel: dm.channel.id,
      text,
      unfurl_links: false,
      unfurl_media: false,
    });
    if (!posted.ts) {
      throw new Error('HuddleFM command returned no timestamp. Do not resend.');
    }
    return { commandTs: posted.ts, state: 'pending' } satisfies {
      commandTs: string;
      state: 'pending';
    };
  },
});

export const huddleDjReplyTool = createTool({
  id: 'huddle_dj_reply',
  description:
    'Check one previously sent HuddleFM command once. Validates it belongs to the current Slack channel and only accepts replies from the configured HuddleFM user. Pending means no confirmed result; never resend a music command because its reply has not arrived.',
  inputSchema: z.strictObject({
    commandTs: z.string().regex(/^\d+\.\d+$/),
  }),
  outputSchema: huddleReplySchema,
  transform: {
    display: {
      output: ({ output }) => ({
        summary:
          output?.state === 'replied'
            ? 'Received HuddleFM reply'
            : 'Waiting for HuddleFM reply',
      }),
    },
  },
  execute: async ({ commandTs }, context) => {
    const ctx = channelContext(context.requestContext);
    const { channel } = parseSlackInput(ctx.channelId ?? ctx.threadId);
    if (!channel || ctx.isDM || !ctx.userId || !ctx.botUserId) {
      throw new Error('Check the command from its original Slack channel.');
    }
    if (!env.HUDDLEFM_USER_ID) {
      throw new Error('HuddleFM is not configured on this deployment.');
    }
    context.abortSignal?.throwIfAborted();
    spendSlackCall(context.requestContext);
    const dm = await slack.webClient.conversations.open({
      users: env.HUDDLEFM_USER_ID,
    });
    if (!dm.channel?.id) {
      throw new Error('Could not open the HuddleFM integration conversation.');
    }
    spendSlackCall(context.requestContext);
    const page = await slack.webClient.conversations.replies({
      channel: dm.channel.id,
      ts: commandTs,
      limit: huddleFm.replyPageSize,
    });
    if (page.has_more) {
      throw new Error(
        'HuddleFM returned an incomplete reply history. Its latest result cannot be confirmed.'
      );
    }
    const original = page.messages?.find((message) => message.ts === commandTs);
    const sent = z
      .looseObject({ v: z.literal(1), channel: z.literal(channel) })
      .safeParse(JSON.parse(original?.text ?? 'null'));
    if (original?.user !== ctx.botUserId || !sent.success) {
      throw new Error('That command does not belong to this Slack channel.');
    }
    const replies = (page.messages ?? [])
      .filter((message) => message.user === env.HUDDLEFM_USER_ID)
      .map((message) => {
        const result = huddleMessageSchema.safeParse(
          JSON.parse(message.text ?? 'null')
        );
        return result.success && result.data.replyTo === commandTs
          ? result.data
          : undefined;
      })
      .filter((reply) => reply !== undefined);
    const reply = replies.at(-1);
    return reply
      ? ({ commandTs, state: 'replied', reply } satisfies z.infer<
          typeof huddleReplySchema
        >)
      : ({ commandTs, state: 'pending' } satisfies z.infer<
          typeof huddleReplySchema
        >);
  },
});
