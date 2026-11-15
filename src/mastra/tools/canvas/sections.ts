import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { slack } from '../../chat/client';
import { channelContext } from '../../lib/context';
import { spendSlackCall } from '../../lib/slack-budget';
import { input, output } from '../../types/tools/index';
import { assertReadableResource } from '../slack/utils';
import { canvasIdSchema } from './utils';

export const lookupCanvasSectionsTool = createTool({
  id: 'lookup_canvas_sections',
  description:
    'Find section ids in one Slack canvas by header type, contained text, or both. Use this before edit_canvas when changing a specific section rather than replacing the whole canvas.',
  inputSchema: input({
    canvasId: canvasIdSchema,
    sectionTypes: z
      .tuple([z.enum(['any_header', 'h1', 'h2', 'h3'])])
      .rest(z.enum(['any_header', 'h1', 'h2', 'h3']))
      .optional(),
    containsText: z.string().min(1).optional(),
  }).refine(({ sectionTypes, containsText }) => sectionTypes || containsText, {
    message: 'Provide sectionTypes, containsText, or both.',
  }),
  outputSchema: output({
    canvasId: z.string(),
    sections: z.array(z.unknown()),
  }),
  transform: {
    display: {
      input: () => ({ summary: 'finding canvas sections' }),
      output: ({ input, output }) => ({
        summary: `found ${output?.sections.length ?? 0} sections in canvas ${input?.canvasId ?? output?.canvasId ?? ''}`,
      }),
    },
  },
  execute: async ({ canvasId, sectionTypes, containsText }, context) => {
    spendSlackCall(context.requestContext);

    const info = await slack.webClient.files.info({ file: canvasId });
    const ctx = channelContext(context.requestContext);
    await assertReadableResource({
      channelIds: [
        ...(info.file?.channels ?? []),
        ...(info.file?.groups ?? []),
      ],
      currentThreadId: ctx.threadId,
    });

    // The refine guarantees one of the two, but Slack's Criteria type needs it
    // narrowed, which the refine does not do.
    const criteria = sectionTypes
      ? {
          section_types: sectionTypes,
          ...(containsText ? { contains_text: containsText } : {}),
        }
      : containsText && { contains_text: containsText };
    if (!criteria) {
      throw new Error('Provide sectionTypes, containsText, or both.');
    }
    const response = await slack.webClient.canvases.sections.lookup({
      canvas_id: canvasId,
      criteria,
    });
    return {
      canvasId,
      sections: response.sections ?? [],
    };
  },
});
