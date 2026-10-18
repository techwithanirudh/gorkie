import { PinoLogger } from '@mastra/loggers';

const SENSITIVE_FIELDS = [
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
];
const ROOTS = ['', '*.', 'error.', 'err.'];
const MAX_CAUSE_DEPTH = 4;

function redactPaths(): string[] {
  const paths: string[] = [];
  for (const root of ROOTS) {
    for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth += 1) {
      const prefix = root + 'cause.'.repeat(depth);
      for (const field of SENSITIVE_FIELDS) {
        paths.push(prefix + field);
      }
    }
  }
  return paths;
}

export const logger = new PinoLogger({
  name: 'orchestrator',
  level: 'info',
  redact: {
    paths: redactPaths(),
    censor: '[redacted]',
  },
});
