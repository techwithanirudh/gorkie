import { env } from '@/env';
import { chatLogger } from '../lib/logger/chat';
import { slackWebLogger } from '../lib/logger/slack';
import { SlackAgentAdapter } from './adapter';
import { content } from './content';

export const slack = new SlackAgentAdapter({
  agentView: true,
  botToken: env.SLACK_BOT_TOKEN,
  signingSecret: env.SLACK_SIGNING_SECRET,
  logger: chatLogger,
  suggestedPrompts: { prompts: content.starters },
  webClientOptions: {
    logger: slackWebLogger,
    retryConfig: { factor: 3.86, retries: 5 },
    timeout: 15_000,
  },
});
