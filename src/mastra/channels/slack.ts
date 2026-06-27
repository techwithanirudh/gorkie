import { createSlackAdapter } from '@chat-adapter/slack';
import { env } from '../../env';

export const slack = createSlackAdapter({
  mode: 'socket',
  appToken: env.SLACK_APP_TOKEN,
  botToken: env.SLACK_BOT_TOKEN,
});
