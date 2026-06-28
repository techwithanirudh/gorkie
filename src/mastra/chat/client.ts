import { env } from '@/env';
import { chatLogger } from '../lib/logger/chat';
import { GorkieSlackAdapter } from './adapter';

export const slack = new GorkieSlackAdapter({
  mode: 'socket',
  appToken: env.SLACK_APP_TOKEN,
  botToken: env.SLACK_BOT_TOKEN,
  logger: chatLogger,
});
