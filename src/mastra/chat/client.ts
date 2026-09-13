import { env } from '@/env';
import { chatLogger } from '../lib/logger/chat';
import { SlackAgentAdapter } from './adapter';
import { content } from './content';

export const slack = new SlackAgentAdapter({
  mode: 'socket',
  agentView: true,
  appToken: env.SLACK_APP_TOKEN,
  botToken: env.SLACK_BOT_TOKEN,
  logger: chatLogger,
  suggestedPrompts: { prompts: content.starters },
  webClientOptions: {
    retryConfig: { factor: 3.86, retries: 5 },
    timeout: 15_000,
  },
});
