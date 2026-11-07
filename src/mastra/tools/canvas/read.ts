import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { channelContext } from '../../lib/context';
import { spendSlackCall } from '../../lib/slack-budget';
import { input, output } from '../../types/tools/index';
import { canvasIdSchema, readCanvasHtml } from './utils';

export const readCanvasTool = createTool({
  id: 'read_canvas',
  description:
    'Read one Slack canvas as HTML by its canvas id, such as F0123ABCD. Get the id from get_channel_info, list_canvases, or create_canvas. Use lookup_canvas_sections before a targeted edit, and update_canvas_table to change a table.',
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
    spendSlackCall(context?.requestContext);

    const ctx = channelContext(context.requestContext);
    const { html, title } = await readCanvasHtml({
      canvasId,
      currentThreadId: ctx.threadId,
    });
    return { canvasId, title, html };
  },
});
