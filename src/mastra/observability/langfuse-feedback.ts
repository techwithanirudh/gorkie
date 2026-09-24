import type { LangfuseClient } from '@langfuse/client';
import type { FeedbackEvent, TracingEvent } from '@mastra/core/observability';
import { BaseExporter } from '@mastra/observability';
import { env } from '@/env';
import { logger } from '../lib/logger';

// `@mastra/langfuse` implements `_exportTracingEvent` and `onScoreEvent` but
// not `onFeedbackEvent`, and its `submitScore` is private, so feedback emitted
// through `observability.addFeedback` is silently dropped.
export class LangfuseFeedbackExporter extends BaseExporter {
  name = 'langfuse-feedback';

  private readonly langfuse: LangfuseClient | undefined;

  constructor(langfuse: LangfuseClient | undefined) {
    super();
    this.langfuse = langfuse;
  }

  async onFeedbackEvent(event: FeedbackEvent): Promise<void> {
    const { feedback } = event;
    if (!this.langfuse) {
      return;
    }
    if (!feedback.traceId) {
      logger.warn('[feedback] dropped feedback with no trace to attach to', {
        feedbackType: feedback.feedbackType,
        user: feedback.feedbackUserId,
      });
      return;
    }
    const numeric = typeof feedback.value === 'number';
    const user = feedback.feedbackUserId ?? 'unknown';
    try {
      this.langfuse.score.create({
        comment: feedback.comment,
        dataType: numeric ? 'NUMERIC' : 'CATEGORICAL',
        environment: env.NODE_ENV,
        id: numeric
          ? `${feedback.traceId}:${user}:${feedback.feedbackType}`
          : `${feedback.traceId}:${user}:${feedback.feedbackType}:${feedback.feedbackId}`,
        metadata: feedback.metadata,
        name: feedback.feedbackType,
        observationId: feedback.spanId,
        traceId: feedback.traceId,
        value: feedback.value,
      });
      await this.langfuse.score.flush();
    } catch (error) {
      logger.warn('[feedback] failed to send score to langfuse', {
        error,
        traceId: feedback.traceId,
      });
    }
  }

  protected _exportTracingEvent(_event: TracingEvent): Promise<void> {
    return Promise.resolve();
  }
}
