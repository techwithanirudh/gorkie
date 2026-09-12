import type { FeedbackEvent, TracingEvent } from '@mastra/core/observability';
import { BaseExporter } from '@mastra/observability';
import { env } from '@/env';
import { logger } from '../lib/logger';

// `@mastra/langfuse` implements `_exportTracingEvent` and `onScoreEvent` but
// not `onFeedbackEvent`, and its `submitScore` is private, so feedback emitted
// through `observability.addFeedback` was fanned out to exporters that all
// ignored it and silently dropped. Neither the Slack thumbs nor the
// `submit_feedback` tool ever left the process.
export class LangfuseFeedbackExporter extends BaseExporter {
  name = 'langfuse-feedback';

  onFeedbackEvent(event: FeedbackEvent): Promise<void> {
    return this.send(event);
  }

  private async send(event: FeedbackEvent): Promise<void> {
    const { feedback } = event;
    if (!feedback.traceId) {
      return;
    }
    const numeric = typeof feedback.value === 'number';
    const user = feedback.feedbackUserId ?? 'unknown';
    const response = await fetch(`${env.LANGFUSE_BASE_URL}/api/public/scores`, {
      body: JSON.stringify({
        comment: numeric ? feedback.comment : String(feedback.value),
        dataType: numeric ? 'NUMERIC' : 'CATEGORICAL',
        // Deterministic rather than `feedbackId`, so re-clicking a thumb
        // overwrites the previous score instead of stacking a second one.
        // This is what makes "has this user already rated this message"
        // answerable without a table of our own.
        id: `${feedback.traceId}:${user}:${feedback.feedbackType}`,
        metadata: feedback.metadata,
        name: feedback.feedbackType,
        observationId: feedback.spanId,
        traceId: feedback.traceId,
        value: feedback.value,
      }),
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${env.LANGFUSE_PUBLIC_KEY}:${env.LANGFUSE_SECRET_KEY}`
        ).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
    if (!response.ok) {
      logger.warn('[feedback] langfuse rejected the score', {
        status: response.status,
        traceId: feedback.traceId,
      });
    }
  }

  protected _exportTracingEvent(_event: TracingEvent): Promise<void> {
    return Promise.resolve();
  }
}
