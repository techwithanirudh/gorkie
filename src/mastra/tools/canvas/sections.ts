import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { spendSlackCall } from '../../lib/slack-budget';
import { readableFile } from '../slack/utils';
import { canvasIdSchema } from './utils';

const sectionType = z.enum(['any_header', 'h1', 'h2', 'h3']);

export const lookupCanvasSectionsTool = createTool({
  id: 'lookup_canvas_sections',
  description:
    'Find section ids in one Slack canvas by header type, contained text, or both. Use this before edit_canvas when changing a specific section rather than replacing the whole canvas.',
  inputSchema: z.strictObject({
    canvasId: canvasIdSchema,
    sectionTypes: z
      .tuple([sectionType])
      .rest(sectionType)
      .optional()
      .describe('Header types to match. Give this, containsText, or both.'),
    containsText: z.string().min(1).optional(),
  }),
  outputSchema: z.strictObject({
    canvasId: z.string(),
    sections: z.array(z.unknown()),
  }),
  transform: {
    display: {
      output: ({ input, output }) => ({
        summary: `Found ${output?.sections.length ?? 0} sections in canvas ${input?.canvasId ?? output?.canvasId ?? ''}`,
      }),
    },
  },
  execute: async ({ canvasId, sectionTypes, containsText }, context) => {
    const criteria = sectionTypes
      ? { section_types: sectionTypes, contains_text: containsText }
      : containsText && { contains_text: containsText };
    if (!criteria) {
      throw new Error('Provide sectionTypes, containsText, or both.');
    }

    spendSlackCall(context.requestContext);

    await readableFile({
      fileId: canvasId,
      requestContext: context.requestContext,
    });
    const response = await slack.webClient.canvases.sections.lookup({
      canvas_id: canvasId,
      criteria,
    });
    return { canvasId, sections: response.sections ?? [] };
  },
});
