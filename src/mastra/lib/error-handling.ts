import {
  isBadRequestError,
  PrefillErrorHandler,
  StreamErrorRetryProcessor,
} from '@mastra/core/processors';

function messageOf(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return '';
}

export function defaultErrorProcessors() {
  return [
    new StreamErrorRetryProcessor({
      retryUnknownErrors: true,
      maxRetries: 2,
      delayMs: 3000,
      matchers: [
        {
          match: (error) =>
            /is not supported|unknown model|model[_ ]not[_ ]found|insufficient credits|no endpoints found/i.test(
              messageOf(error)
            ),
          maxRetries: 0,
        },
        // A 400 is deterministic, so fall through to the next model rather than retry.
        { match: isBadRequestError, maxRetries: 0 },
        {
          match: (error) => {
            const code =
              error && typeof error === 'object' && 'code' in error
                ? error.code
                : undefined;
            if (
              typeof code === 'string' &&
              code.toUpperCase() === 'ECONNRESET'
            ) {
              return true;
            }
            return /econnreset|socket hang up/i.test(messageOf(error));
          },
          maxRetries: 2,
          delayMs: ({ retryCount }) => Math.min(1000 * 2 ** retryCount, 30_000),
        },
        {
          match: (error) =>
            /temporarily rate-limited upstream|too many requests/i.test(
              messageOf(error)
            ),
          maxRetries: 2,
          delayMs: 3000,
        },
      ],
    }),
    new PrefillErrorHandler(),
  ];
}
