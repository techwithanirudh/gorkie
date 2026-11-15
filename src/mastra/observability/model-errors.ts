import { SpanType } from '@mastra/core/observability';
import type { ErrorProcessor } from '@mastra/core/processors';
import { APICallError } from 'ai';
import { logger } from '../lib/logger';

// Mastra never exports a provider error that a retry or the fallback ladder
// recovers from.
export const modelErrors: ErrorProcessor = {
  id: 'model-errors',
  processAPIError({ error, retryCount, stepNumber, tracingContext }) {
    const provider = APICallError.isInstance(error)
      ? {
          host: URL.parse(error.url)?.host,
          isRetryable: error.isRetryable,
          statusCode: error.statusCode,
        }
      : {};
    const metadata = { ...provider, retryCount, stepNumber };
    logger.warn('[model] provider call failed', { error, ...metadata });
    tracingContext?.currentSpan
      ?.findParent(SpanType.AGENT_RUN)
      ?.createChildSpan({
        metadata,
        name: `model error ${provider.statusCode ?? ''}`.trim(),
        type: SpanType.GENERIC,
      })
      .error({
        endSpan: true,
        error: error instanceof Error ? error : new Error(String(error)),
      });
  },
};
