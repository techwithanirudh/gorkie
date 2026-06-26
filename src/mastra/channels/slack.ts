import { createSlackAdapter } from '@chat-adapter/slack';
import { env } from '../../env';

// Shared Slack adapter instance — used both as the channels adapter and by the
// handlers (for `decodeThreadId`, to tell a thread-root mention from a reply).
export const slack = createSlackAdapter({
  mode: 'socket',
  appToken: env.SLACK_APP_TOKEN,
  botToken: env.SLACK_BOT_TOKEN,
});
