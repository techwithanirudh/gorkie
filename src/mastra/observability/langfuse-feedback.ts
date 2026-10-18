import { LangfuseClient } from '@langfuse/client';
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

  private readonly langfuse = new LangfuseClient({
    baseUrl: env.LANGFUSE_BASE_URL,
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
  });

  async onFeedbackEvent(event: FeedbackEvent): Promise<void> {
    const { feedback } = event;
    if (!feedback.traceId) {
      return;
    }
    const numeric = typeof feedback.value === 'number';
    const user = feedback.feedbackUserId ?? 'unknown';
    this.langfuse.score.create({
      comment: numeric ? feedback.comment : String(feedback.value),
      dataType: numeric ? 'NUMERIC' : 'CATEGORICAL',
      id: `${feedback.traceId}:${user}:${feedback.feedbackType}`,
      metadata: feedback.metadata,
      name: feedback.feedbackType,
      observationId: feedback.spanId,
      traceId: feedback.traceId,
      value: feedback.value,
    });
    try {
      await this.langfuse.score.flush();
    } catch (error) {
      logger.warn('[feedback] failed to flush score to langfuse', {
        error,
        traceId: feedback.traceId,
      });
    }
  }

  protected _exportTracingEvent(_event: TracingEvent): Promise<void> {
    return Promise.resolve();
  }
}
