import type { Logger as ChatLogger } from 'chat';
import { logger, logMeta } from '.';

function adapt(prefix: string): ChatLogger {
  const tag = (message: string): string => `[${prefix}] ${message}`;
  return {
    child: (childPrefix) => adapt(`${prefix}:${childPrefix}`),
    debug: (message, ...args) => logger.debug(tag(message), logMeta(args)),
    info: (message, ...args) =>
      message === 'Processing socket mode retry'
        ? logger.debug(tag(message), logMeta(args))
        : logger.info(tag(message), logMeta(args)),
    warn: (message, ...args) => logger.warn(tag(message), logMeta(args)),
    error: (message, ...args) => logger.error(tag(message), logMeta(args)),
  };
}

export const chatLogger: ChatLogger = adapt('chat');
