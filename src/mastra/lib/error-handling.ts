import {
  isBadRequestError,
  PrefillErrorHandler,
  StreamErrorRetryProcessor,
} from '@mastra/core/processors';

// Mid-stream provider errors arrive as a bare string, not an `Error`, so
// matching on `instanceof Error` alone never fires on real traffic.
function messageOf(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return '';
}

// No retry can fix these, so spending the budget just delays the fallback.
const terminalPattern =
  /is not supported|unknown model|model[_ ]not[_ ]found|insufficient credits|no endpoints found/i;

function isTerminalModelError(error: unknown): boolean {
  return terminalPattern.test(messageOf(error));
}

const econnresetMaxRetries = 2;
const econnresetRetryInitialDelayMs = 1000;
const econnresetRetryMaxDelayMs = 30_000;
const econnresetMessagePattern = /econnreset|socket hang up/i;

function isEconnresetError(error: unknown): boolean {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? error.code
      : undefined;
  if (typeof code === 'string' && code.toUpperCase() === 'ECONNRESET') {
    return true;
  }
  return econnresetMessagePattern.test(messageOf(error));
}

const rateLimitPattern = /temporarily rate-limited upstream|too many requests/i;

function isRateLimitError(error: unknown): boolean {
  return rateLimitPattern.test(messageOf(error));
}

export function defaultErrorProcessors() {
  return [
    new StreamErrorRetryProcessor({
      retryUnknownErrors: true,
      maxRetries: 2,
      delayMs: 3000,
      matchers: [
        // First, or the catch-all below swallows it.
        { match: isTerminalModelError, maxRetries: 0 },
        { match: isBadRequestError, maxRetries: 1, delayMs: 2000 },
        {
          match: isEconnresetError,
          maxRetries: econnresetMaxRetries,
          delayMs: ({ retryCount }) =>
            Math.min(
              econnresetRetryInitialDelayMs * 2 ** retryCount,
              econnresetRetryMaxDelayMs
            ),
        },
        { match: isRateLimitError, maxRetries: 2, delayMs: 3000 },
      ],
    }),
    new PrefillErrorHandler(),
  ];
}
