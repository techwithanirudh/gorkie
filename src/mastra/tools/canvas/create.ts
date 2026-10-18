import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { rawId } from '../../lib/ids';
import { input, output } from '../../types/tools/index';
import { assertCanManageChannel } from './utils';

export const createCanvasTool = createTool({
  id: 'create_canvas',
  description:
    'Create either a standalone Slack canvas or the Canvas tab for a channel. A channel canvas defaults to the current channel and fails if that channel already has one. A standalone canvas can optionally be shared with the current channel. Canvas markdown uses ![](@USER_ID) for user mentions and ![](#CHANNEL_ID) for channel mentions. Regular Slack message syntax such as <@U123> and <#C123> renders as literal text in a canvas.',
  inputSchema: input({
    mode: z.enum(['standalone', 'channel']).default('standalone'),
    title: z.string().min(1).optional(),
    channelId: z
      .string()
      .optional()
      .describe(
        'Current channel id (slack:C...). For channel mode, defaults to the current channel. For standalone mode, shares the new canvas into that channel.'
      ),
    markdown: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Initial canvas content as Markdown. For a user mention, write ![](@U123ABC). For a channel mention, write ![](#C123ABC). Do not write <@U123ABC> or <#C123ABC>; message mention syntax renders as literal text in canvases.'
      ),
  }),
  outputSchema: output({
    mode: z.enum(['standalone', 'channel']),
    canvasId: z.string(),
    channelId: z.string().optional(),
  }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: `Created canvas ${output?.canvasId ?? ''}`,
      }),
    },
  },
  execute: async ({ mode, title, channelId, markdown }, context) => {
    const ctx = channelContext(context?.requestContext);
    if (mode === 'standalone') {
      if (channelId) {
        assertCanManageChannel({ channelId, ctx });
      }
      const response = await slack.webClient.canvases.create({
        ...(title ? { title } : {}),
        ...(channelId ? { channel_id: rawId(channelId) } : {}),
        ...(markdown
          ? { document_content: { type: 'markdown' as const, markdown } }
          : {}),
      });
      if (!response.canvas_id) {
        throw new Error('Slack created the canvas without returning its id.');
      }
      return {
        mode,
        canvasId: response.canvas_id,
        ...(channelId ? { channelId: `slack:${rawId(channelId)}` } : {}),
      };
    }

    const targetChannelId = channelId ?? ctx.channelId;
    if (!targetChannelId) {
      throw new Error('No channel to create a channel canvas for.');
    }
    assertCanManageChannel({ channelId: targetChannelId, ctx });
    try {
      const response = await slack.webClient.conversations.canvases.create({
        channel_id: rawId(targetChannelId),
        ...(title ? { title } : {}),
        ...(markdown
          ? { document_content: { type: 'markdown' as const, markdown } }
          : {}),
      });
      if (!response.canvas_id) {
        throw new Error(
          'Slack created the channel canvas without returning its id.'
        );
      }
      return {
        mode,
        channelId: `slack:${rawId(targetChannelId)}`,
        canvasId: response.canvas_id,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason.includes('channel_canvas_already_exists')) {
        throw new Error(
          `${targetChannelId} already has a canvas. Use edit_canvas to change it instead.`,
          { cause: error }
        );
      }
      throw error;
    }
  },
});
