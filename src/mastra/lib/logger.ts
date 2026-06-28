import { PinoLogger } from '@mastra/loggers';

export const logger = new PinoLogger({
  name: 'gorkie',
  level: 'info',
  redact: {
    paths: [
      'requestBodyValues',
      'requestObject',
      'responseHeaders',
      '*.requestBodyValues',
      '*.requestObject',
      '*.responseHeaders',
      'error.requestBodyValues',
      'error.requestObject',
      'error.responseHeaders',
      'error.cause.requestBodyValues',
      'error.cause.requestObject',
      'error.cause.responseHeaders',
      'error.cause.cause.requestBodyValues',
      'error.cause.cause.requestObject',
      'error.cause.cause.responseHeaders',
      'error.cause.cause.cause.requestBodyValues',
      'error.cause.cause.cause.requestObject',
      'error.cause.cause.cause.responseHeaders',
    ],
    censor: '[redacted]',
  },
});
