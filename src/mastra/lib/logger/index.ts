import { PinoLogger } from '@mastra/loggers';

const SENSITIVE_FIELDS = [
  'requestBodyValues',
  'requestObject',
  'responseHeaders',
  'responseBody',
];
const ROOTS = ['', '*.', 'error.', 'err.'];
const MAX_CAUSE_DEPTH = 4;

function redactPaths(): string[] {
  const paths: string[] = [];
  for (const root of ROOTS) {
    for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth++) {
      const prefix = root + 'cause.'.repeat(depth);
      for (const field of SENSITIVE_FIELDS) {
        paths.push(prefix + field);
      }
    }
  }
  return paths;
}

export const logger = new PinoLogger({
  name: 'gorkie',
  level: 'info',
  redact: {
    paths: redactPaths(),
    censor: '[redacted]',
  },
});
