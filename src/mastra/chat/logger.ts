import type { Logger as ChatLogger } from 'chat';
import { logger } from '../lib/logger';

function meta(args: unknown[]): Record<string, unknown> {
  const [first] = args;
  if (args.length === 1 && first && typeof first === 'object') {
    return first as Record<string, unknown>;
  }
  return args.length > 0 ? { args } : {};
}

function adapt(prefix: string): ChatLogger {
  const tag = (message: string): string => `[${prefix}] ${message}`;
  return {
    child: (childPrefix) => adapt(`${prefix}:${childPrefix}`),
    debug: (message, ...args) => logger.debug(tag(message), meta(args)),
    info: (message, ...args) => logger.info(tag(message), meta(args)),
    warn: (message, ...args) => logger.warn(tag(message), meta(args)),
    error: (message, ...args) => logger.error(tag(message), meta(args)),
  };
}

export const chatLogger: ChatLogger = adapt('chat');
