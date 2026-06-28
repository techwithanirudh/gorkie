import { createSlackAdapter } from '@chat-adapter/slack';
import { env } from '@/env';
import { chatLogger } from './logger';

export const slack = createSlackAdapter({
  mode: 'socket',
  appToken: env.SLACK_APP_TOKEN,
  botToken: env.SLACK_BOT_TOKEN,
  logger: chatLogger,
});
