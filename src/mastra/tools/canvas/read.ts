import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { env } from '@/env';
import { spendSlackCall } from '../../lib/slack-budget';
import { input, output } from '../../types/tools/index';
import { canvasIdSchema, readableCanvas } from './utils';

export const readCanvasTool = createTool({
  id: 'read_canvas',
  description:
    'Read one Slack canvas as HTML by its canvas id, such as F0123ABCD. Get the id from get_channel_info, list_canvases, or create_canvas. Use lookup_canvas_sections before a targeted edit.',
  inputSchema: input({
    canvasId: canvasIdSchema,
  }),
  outputSchema: output({
    canvasId: z.string(),
    title: z.string().optional(),
    html: z.string(),
  }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: output?.title ?? output?.canvasId ?? 'Canvas read',
      }),
    },
  },
  execute: async ({ canvasId }, context) => {
    spendSlackCall(context.requestContext);

    const canvas = await readableCanvas({
      canvasId,
      requestContext: context.requestContext,
    });
    const url = canvas?.url_private_download ?? canvas?.url_private;
    if (!url) {
      throw new Error(
        `Could not resolve a content URL for canvas ${canvasId}. It may have been deleted, or the bot may not have access to it.`
      );
    }
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
    });
    if (!response.ok) {
      throw new Error(`Failed to read canvas ${canvasId}: ${response.status}`);
    }
    return {
      canvasId,
      title: canvas?.title,
      html: await response.text(),
    };
  },
});
