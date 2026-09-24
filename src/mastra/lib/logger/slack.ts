import { LogLevel, type Logger as SlackLogger } from '@slack/web-api';
import { logger, logMeta } from '.';

// Slack's error when the bot is already a member, the state every caller
// wants. The WebClient logs it at warn anyway.
// TODO(slopradar): review: architecture | a Slack API error code owned by the logger module; tools/slack/utils.ts and chat/onboarding.ts import it from a logger to compare API errors | move it beside the Slack client (chat/client.ts) and import it here
export const ALREADY_IN_CHANNEL = 'already_in_channel';

export const slackWebLogger: SlackLogger = {
  debug: (...args) => logger.debug('[slack:web-api]', logMeta(args)),
  info: (...args) => logger.debug('[slack:web-api]', logMeta(args)),
  warn: (...args) =>
    args.includes(ALREADY_IN_CHANNEL)
      ? logger.debug('[slack:web-api]', logMeta(args))
      : logger.warn('[slack:web-api]', logMeta(args)),
  error: (...args) => logger.error('[slack:web-api]', logMeta(args)),
  setLevel: () => undefined,
  getLevel: () => LogLevel.DEBUG,
  setName: () => undefined,
};
