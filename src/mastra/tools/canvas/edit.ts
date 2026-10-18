import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { input, output } from '../../types/tools/index';
import { assertReadableResource } from '../slack/utils';
import { canvasIdSchema } from './utils';

const markdownContentSchema = z.object({
  type: z.literal('markdown').default('markdown'),
  markdown: z
    .string()
    .min(1)
    .describe(
      'Markdown canvas content. Mentions use canvas-specific syntax, not regular message mentions: ![](@USER_ID) for a user, ![](#CHANNEL_ID) for a channel. <@U123> renders as literal plain text in a canvas.'
    ),
});

const canvasChangeSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('insert_after'),
    section_id: z.string().min(1),
    document_content: markdownContentSchema,
  }),
  z.object({
    operation: z.literal('insert_before'),
    section_id: z.string().min(1),
    document_content: markdownContentSchema,
  }),
  z.object({
    operation: z.literal('insert_at_start'),
    document_content: markdownContentSchema,
  }),
  z.object({
    operation: z.literal('insert_at_end'),
    document_content: markdownContentSchema,
  }),
  z.object({
    operation: z.literal('replace'),
    section_id: z.string().min(1).optional(),
    document_content: markdownContentSchema,
  }),
  z.object({
    operation: z.literal('delete'),
    section_id: z.string().min(1),
  }),
]);

export const editCanvasTool = createTool({
  id: 'edit_canvas',
  description:
    'Edit a Slack canvas by applying ordered markdown changes: insert, replace, or delete sections. Use lookup_canvas_sections to find section ids first. Canvas mentions use ![](@USER_ID) and ![](#CHANNEL_ID), not <@U123>.',
  inputSchema: input({
    canvasId: canvasIdSchema,
    changes: z.tuple([canvasChangeSchema]).rest(canvasChangeSchema),
  }),
  outputSchema: output({ canvasId: z.string() }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: `Edited canvas ${output?.canvasId ?? ''}`,
      }),
    },
  },
  execute: async ({ canvasId, changes }, context) => {
    const info = await slack.webClient.files.info({ file: canvasId });
    const ctx = channelContext(context.requestContext);
    await assertReadableResource({
      channelIds: [
        ...(info.file?.channels ?? []),
        ...(info.file?.groups ?? []),
      ],
      currentThreadId: ctx.threadId,
    });
    try {
      await slack.webClient.canvases.edit({
        canvas_id: canvasId,
        changes,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason.includes('restricted_action')) {
        throw new Error(
          `Can't edit canvas ${canvasId}: only read access, not write. This canvas's sharing settings need to grant the bot write access (its owner can do this from the canvas's "Manage access" menu in Slack), the canvases:write scope alone isn't enough.`,
          { cause: error }
        );
      }
      throw error;
    }
    return { canvasId };
  },
});
