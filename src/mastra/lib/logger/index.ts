import { PinoLogger } from '@mastra/loggers';

export const logger = new PinoLogger({
  name: 'orchestrator',
  level: 'info',
  redact: {
    paths: ['', '*.', 'error.', 'err.']
      .flatMap((root) =>
        Array.from({ length: 5 }, (_, depth) => root + 'cause.'.repeat(depth))
      )
      .flatMap((prefix) =>
        [
          'requestBodyValues',
          'requestObject',
          'responseHeaders',
          'responseBody',
          // Octokit RequestError carries the outgoing request (with client_secret and
          // refresh_token) as a top-level `request` property that its own redaction
          // misses. Censor the whole thing, plus the raw fields wherever they surface.
          'request',
          'client_secret',
          'refresh_token',
          'clientSecret',
          'refreshToken',
        ].map((field) => prefix + field)
      ),
    censor: '[redacted]',
  },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function logMeta(args: unknown[]): Record<string, unknown> {
  const [first] = args;
  if (args.length === 1 && isRecord(first)) {
    return first;
  }
  return args.length > 0 ? { args } : {};
}
