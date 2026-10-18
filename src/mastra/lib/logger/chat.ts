import type { Logger as ChatLogger } from 'chat';
import { isRecord } from '../utils';
import { logger } from '.';

function meta(args: unknown[]): Record<string, unknown> {
  const [first] = args;
  if (args.length === 1 && isRecord(first)) {
    return first;
  }
  return args.length > 0 ? { args } : {};
}

const debugLogs = new Set(['Processing socket mode retry']);

function adapt(prefix: string): ChatLogger {
  const tag = (message: string): string => `[${prefix}] ${message}`;
  return {
    child: (childPrefix) => adapt(`${prefix}:${childPrefix}`),
    debug: (message, ...args) => logger.debug(tag(message), meta(args)),
    info: (message, ...args) =>
      debugLogs.has(message)
        ? logger.debug(tag(message), meta(args))
        : logger.info(tag(message), meta(args)),
    warn: (message, ...args) => logger.warn(tag(message), meta(args)),
    error: (message, ...args) => logger.error(tag(message), meta(args)),
  };
}

export const chatLogger: ChatLogger = adapt('chat');
