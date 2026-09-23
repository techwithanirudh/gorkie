import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { slackErrorSchema } from '../../types/tools/index';
import { readableFile } from '../slack/utils';
import { assertCanManageChannel, canvasIdSchema } from './utils';

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
    'Edit a Slack canvas shared in the current conversation by applying ordered markdown changes: insert, replace, or delete sections. Canvases that are not shared in the current channel or DM cannot be edited, even if they are readable. Use lookup_canvas_sections to find section ids first. Canvas mentions use ![](@USER_ID) and ![](#CHANNEL_ID), not <@U123>.',
  inputSchema: z.strictObject({
    canvasId: canvasIdSchema,
    changes: z.tuple([canvasChangeSchema]).rest(canvasChangeSchema),
  }),
  outputSchema: z.strictObject({ canvasId: z.string() }),
  transform: {
    display: {
      output: ({ output }) => ({
        summary: `Edited canvas ${output?.canvasId ?? ''}`,
      }),
    },
  },
  execute: async ({ canvasId, changes }, context) => {
    const { channelIds } = await readableFile({
      fileId: canvasId,
      requestContext: context.requestContext,
    });
    assertCanManageChannel({
      channelIds,
      ctx: channelContext(context.requestContext),
    });
    try {
      await slack.webClient.canvases.edit({
        canvas_id: canvasId,
        changes,
      });
    } catch (error) {
      if (
        slackErrorSchema.safeParse(error).data?.data?.error ===
        'restricted_action'
      ) {
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
