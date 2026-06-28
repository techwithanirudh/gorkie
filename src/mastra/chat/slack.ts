import { env } from '@/env';
import { GorkieSlackAdapter } from './adapter';
import { chatLogger } from './logger';

export const slack = new GorkieSlackAdapter({
  mode: 'socket',
  appToken: env.SLACK_APP_TOKEN,
  botToken: env.SLACK_BOT_TOKEN,
  logger: chatLogger,
});
