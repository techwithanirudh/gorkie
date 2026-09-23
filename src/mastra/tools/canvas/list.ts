import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { rawId } from '../../lib/ids';
import { spendSlackCall } from '../../lib/slack-budget';
import { input, output } from '../../types/tools/index';
import { assertReadableChannel } from '../slack/utils';

const canvasFile = z
  .looseObject({
    id: z.string(),
    title: z.string().optional(),
    name: z.string().optional(),
    created: z.number().optional(),
    updated: z.number().optional(),
    permalink: z.string().optional(),
  })
  .transform((f) => ({
    canvasId: f.id,
    title: f.title || f.name,
    created: f.created,
    updated: f.updated,
    permalink: f.permalink,
  }));

export const listCanvasesTool = createTool({
  id: 'list_canvases',
  description:
    'List one page of Slack canvases visible to the bot, optionally filtered by title. Channel scope defaults to the current channel. Workspace scope includes standalone canvases and canvases from other accessible channels. Use Slack code mode for exhaustive pagination or further filtering.',
  inputSchema: input({
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
  }).refine(({ scope, channelId }) => !(scope === 'workspace' && channelId), {
    message: 'channelId cannot be used with workspace scope.',
    path: ['channelId'],
  }),
  outputSchema: output({
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
    if (scope === 'channel' && !id) {
      throw new Error('No channel to list canvases from.');
    }
    if (id) {
      await assertReadableChannel({
        channelId: id,
        currentThreadId: ctx.threadId,
      });
    }

    spendSlackCall(context.requestContext);

    const response = await slack.webClient.files.list({
      types: 'canvas',
      count: limit,
      page,
      ...(id ? { channel: rawId(id) } : {}),
    });
    const canvases = (response.files ?? [])
      .map((f) => canvasFile.parse(f))
      .filter(
        (canvas) =>
          !query || canvas.title?.toLowerCase().includes(query.toLowerCase())
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
