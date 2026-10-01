import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { parseSlackInput } from '../../lib/ids';
import { spendSlackCall } from '../../lib/slack-budget';
import { assertCanRead, readableChannels } from '../slack/access';

const canvasFile = z
  .looseObject({
    id: z.string(),
    title: z.string().optional(),
    name: z.string().optional(),
    created: z.number().optional(),
    updated: z.number().optional(),
    permalink: z.string().optional(),
    channels: z.array(z.string()).optional(),
    groups: z.array(z.string()).optional(),
    ims: z.array(z.string()).optional(),
  })
  .transform((f) => ({
    canvasId: f.id,
    title: f.title || f.name,
    created: f.created,
    updated: f.updated,
    permalink: f.permalink,
    channelIds: [...(f.channels ?? []), ...(f.groups ?? []), ...(f.ims ?? [])],
  }));

export const listCanvasesTool = createTool({
  id: 'list_canvases',
  description:
    'List one page of Slack canvases visible to the bot, optionally filtered by title. Channel scope defaults to the current channel. Workspace scope lists canvases shared in public channels (or the current conversation); canvases only in private channels, DMs, or not shared anywhere are left out, so a page can hold fewer than limit. Use Slack code mode for exhaustive pagination or further filtering.',
  inputSchema: z
    .strictObject({
      query: z
        .string()
        .min(1)
        .optional()
        .describe('Case-insensitive title filter.'),
      scope: z
        .enum(['channel', 'workspace'])
        .default('channel')
        .describe(
          'Use channel for the current or specified channel, or workspace for all accessible canvases.'
        ),
      channelId: z
        .string()
        .optional()
        .describe(
          'Channel id (slack:C...) to use instead of the current channel. Only valid with channel scope.'
        ),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      page: z.coerce.number().int().min(1).default(1),
    })
    .refine(({ scope, channelId }) => !(scope === 'workspace' && channelId), {
      message: 'channelId cannot be used with workspace scope.',
      path: ['channelId'],
    }),
  outputSchema: z.strictObject({
    scope: z.enum(['channel', 'workspace']),
    channelId: z.string().optional(),
    canvases: z.array(
      z.strictObject({
        canvasId: z.string(),
        title: z.string().optional(),
        created: z.number().optional(),
        updated: z.number().optional(),
        permalink: z.string().optional(),
      })
    ),
    nextPage: z.number().optional(),
  }),
  transform: {
    display: {
      output: ({ input, output }) => ({
        summary: `Found ${output?.canvases.length ?? 0} canvases in ${input?.scope === 'workspace' ? 'the workspace' : (input?.channelId ?? output?.channelId ?? 'the current channel')}`,
      }),
    },
  },
  execute: async ({ query, scope, channelId, limit, page }, context) => {
    const ctx = channelContext(context.requestContext);
    const id = scope === 'workspace' ? undefined : (channelId ?? ctx.channelId);
    const { channel } = parseSlackInput(id);
    if (scope === 'channel' && !channel) {
      throw new Error('No channel to list canvases from.');
    }
    if (channel) {
      await assertCanRead({ channelId: channel, ctx });
    }

    spendSlackCall(context.requestContext);

    const response = await slack.webClient.files.list({
      types: 'canvas',
      count: limit,
      page,
      ...(channel ? { channel } : {}),
    });
    const matches = (response.files ?? [])
      .map((f) => canvasFile.parse(f))
      .filter(
        (canvas) =>
          !query || canvas.title?.toLowerCase().includes(query.toLowerCase())
      );
    const readable = channel
      ? undefined
      : await readableChannels({
          channelIds: [...new Set(matches.flatMap((c) => c.channelIds))],
          ctx,
        });
    const canvases = matches.flatMap(({ channelIds, ...canvas }) =>
      !readable || channelIds.some((channelId) => readable.has(channelId))
        ? [canvas]
        : []
    );
    const nextPage =
      response.paging?.page &&
      response.paging.pages &&
      response.paging.page < response.paging.pages
        ? response.paging.page + 1
        : undefined;

    return {
      scope,
      channelId: id,
      canvases,
      nextPage,
    };
  },
});
