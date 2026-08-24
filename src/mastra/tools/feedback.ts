import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getMastra } from '../chat/mastra-instance';
import { channelContext } from '../lib/context';
import { rawId } from '../lib/ids';
import { logger } from '../lib/logger';
import { input, output } from '../types/tools/index';

export const submitFeedbackTool = createTool({
  id: 'submit_feedback',
  description:
    "Record feedback about gorkie itself so it reaches the maintainers. Use this when someone reports that you're broken or wrong, praises something you did, or asks for a change or new capability. Write the feedback in your own words as a clear, self-contained report: what they were doing, what happened, and what they expected. Do not use this for feedback about anything other than gorkie, and do not use it as a substitute for actually answering the person.",
  inputSchema: input({
    kind: z
      .enum(['bug', 'praise', 'suggestion', 'other'])
      .describe(
        'bug when something misbehaved, suggestion for a requested change or new capability, praise when something worked well, other when none fit.'
      ),
    body: z
      .string()
      .min(1)
      .describe(
        'The feedback as a self-contained report: what they were doing, what happened, and what they expected.'
      ),
  }),
  outputSchema: output({ kind: z.string() }),
  transform: {
    display: {
      output: ({ output: result }) => ({
        summary: `Logged ${result?.kind ?? ''} feedback`,
      }),
    },
  },
  execute: async ({ kind, body }, context) => {
    const ctx = channelContext(context.requestContext);
    if (!ctx.userId) {
      throw new Error('No current user to attribute this feedback to.');
    }

    // Taken off the live span so the feedback lands on this run's trace. Any
    // correlationContext also skips addFeedback's storage lookup, which holds
    // nothing in prod because traces export to Platform only.
    const correlationContext =
      context.tracingContext?.currentSpan?.getCorrelationContext?.();
    if (!correlationContext) {
      throw new Error('No active trace to attach this feedback to.');
    }

    const { observability } = getMastra();
    if (!observability.addFeedback) {
      throw new Error('Feedback is not supported by this observability setup.');
    }

    await observability.addFeedback({
      correlationContext,
      feedback: {
        feedbackSource: 'user',
        feedbackType: kind,
        feedbackUserId: rawId(ctx.userId),
        metadata: {
          channelId: ctx.channelId ? rawId(ctx.channelId) : undefined,
          messageId: ctx.messageId,
          threadId: ctx.threadId,
        },
        value: body,
      },
    });

    logger.info('[feedback] recorded', {
      kind,
      traceId: correlationContext.traceId,
      userId: ctx.userId,
    });
    return { kind };
  },
});
