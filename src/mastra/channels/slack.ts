import { createSlackAdapter } from '@chat-adapter/slack';
import { env } from '../../env';

// Shared instance: the channels adapter, and the handlers' source for decodeThreadId.
export const slack = createSlackAdapter({
  mode: 'socket',
  appToken: env.SLACK_APP_TOKEN,
  botToken: env.SLACK_BOT_TOKEN,
});
