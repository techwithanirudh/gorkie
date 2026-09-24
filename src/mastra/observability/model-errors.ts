import { SpanType } from '@mastra/core/observability';
import type { ErrorProcessor } from '@mastra/core/processors';
import { APICallError } from 'ai';
import { logger } from '../lib/logger';

// A provider error that a retry or the fallback ladder recovers from leaves no
// trace in Langfuse: the run ends fine and the failed attempt is never
// exported. This records each one as an ERROR child of the agent run. It must
// sit before any processor that answers `retry`, since the first retry ends
// the error-processor pass.
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
