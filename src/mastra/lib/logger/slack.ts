import { LogLevel, type Logger as SlackLogger } from '@slack/web-api';
import { isRecord } from '../utils';
import { logger } from '.';

function meta(args: unknown[]): Record<string, unknown> {
  const [first] = args;
  if (args.length === 1 && isRecord(first)) {
    return first;
  }
  return args.length > 0 ? { args } : {};
}

export const slackWebLogger: SlackLogger = {
  debug: (...args) => logger.debug('[slack:web-api]', meta(args)),
  info: (...args) => logger.debug('[slack:web-api]', meta(args)),
  warn: (...args) =>
    args.includes('already_in_channel')
      ? logger.debug('[slack:web-api]', meta(args))
      : logger.warn('[slack:web-api]', meta(args)),
  error: (...args) => logger.error('[slack:web-api]', meta(args)),
  setLevel: () => undefined,
  getLevel: () => LogLevel.DEBUG,
  setName: () => undefined,
};
