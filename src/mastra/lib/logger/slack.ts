import { LogLevel, type Logger as SlackLogger } from '@slack/web-api';
import { alreadyInChannel } from '../../types/tools/slack';
import { logger, logMeta } from '.';

export const slackWebLogger: SlackLogger = {
  debug: (...args) => logger.debug('[slack:web-api]', logMeta(args)),
  info: (...args) => logger.debug('[slack:web-api]', logMeta(args)),
  warn: (...args) =>
    args.includes(alreadyInChannel)
      ? logger.debug('[slack:web-api]', logMeta(args))
      : logger.warn('[slack:web-api]', logMeta(args)),
  error: (...args) => logger.error('[slack:web-api]', logMeta(args)),
  setLevel: () => undefined,
  getLevel: () => LogLevel.DEBUG,
  setName: () => undefined,
};
