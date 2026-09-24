import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { canvas as canvasConfig } from '../../config';
import { spendSlackCall } from '../../lib/slack-budget';
import { fetchPrivateSlackFile, readableFile } from '../slack/utils';
import { canvasIdSchema } from './utils';

export const readCanvasTool = createTool({
  id: 'read_canvas',
  description:
    'Read one Slack canvas as HTML by its canvas id, such as F0123ABCD. Get the id from get_channel_info, list_canvases, or create_canvas. Use lookup_canvas_sections before a targeted edit.',
  inputSchema: z.strictObject({
    canvasId: canvasIdSchema,
  }),
  outputSchema: z.strictObject({
    canvasId: z.string(),
    title: z.string().optional(),
    html: z.string(),
    truncated: z.boolean(),
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

    const { file: canvas } = await readableFile({
      fileId: canvasId,
      requestContext: context.requestContext,
    });
    const url = canvas?.url_private_download ?? canvas?.url_private;
    if (!url) {
      throw new Error(
        `Could not resolve a content URL for canvas ${canvasId}. It may have been deleted, or the bot may not have access to it.`
      );
    }
    const response = await fetchPrivateSlackFile({ url });
    const html = await response.text();
    const truncated = html.length > canvasConfig.maxReadChars;
    return {
      canvasId,
      title: canvas?.title,
      html: truncated
        ? `${html.slice(0, canvasConfig.maxReadChars)}\n<!-- Truncated: showed ${canvasConfig.maxReadChars} of ${html.length} characters. Use lookup_canvas_sections to find the part you need. -->`
        : html,
      truncated,
    };
  },
});
