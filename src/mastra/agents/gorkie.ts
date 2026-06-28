import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { workspace } from '../workspace';
import { sandboxLifecycle } from '../workspace/lifecycle';
import { tools } from '../tools';
import { buildInstructions } from '../prompts';
import { slack } from '../chat/slack';
import { onMention, onSubscribedMessage, onDirectMessage } from '../chat/handlers';
import { toolDisplay } from '../chat/tool-display';
import { env } from '@/env';

export const gorkieAgent = new Agent({
  id: 'gorkie',
  name: 'gorkie',
  instructions: ({ requestContext }) => buildInstructions(requestContext),
  model: [
    {
      model: { id: 'openrouter/moonshotai/kimi-k2.6', apiKey: env.HACKCLUB_API_KEY, url: 'https://ai.hackclub.com/proxy/v1' },
      maxRetries: 3,
      providerOptions: { openrouter: { reasoningEffort: 'medium' } },
    },
    {
      model: { id: 'openrouter/moonshotai/kimi-k2.6', apiKey: env.OPENROUTER_API_KEY, url: env.OPENROUTER_BASE_URL },
      maxRetries: 3,
      providerOptions: { openrouter: { reasoningEffort: 'medium' } },
    },
    {
      model: { id: 'opencode-go/kimi-k2.6', apiKey: env.OPENCODE_API_KEY, url: 'https://opencode.ai/zen/go/v1' },
      maxRetries: 3,
    },
  ],
  defaultOptions: { maxSteps: 150 },
  workspace,
  outputProcessors: [sandboxLifecycle],
  tools,
  memory: new Memory({
    options: {
      lastMessages: 20,
      observationalMemory: {
        model: [
          { model: { id: 'openrouter/google/gemini-2.5-flash', apiKey: env.HACKCLUB_API_KEY, url: 'https://ai.hackclub.com/proxy/v1' }, maxRetries: 3 },
          { model: { id: 'openrouter/google/gemini-2.5-flash', apiKey: env.OPENROUTER_API_KEY, url: env.OPENROUTER_BASE_URL }, maxRetries: 3 },
          { model: { id: 'opencode-go/deepseek-v4-flash', apiKey: env.OPENCODE_API_KEY, url: 'https://opencode.ai/zen/go/v1' }, maxRetries: 3 },
        ],
        temporalMarkers: true,
        scope: 'thread',
      },
    },
  }),
  channels: {
    adapters: {
      slack: {
        adapter: slack,
        streaming: true,
        toolDisplay,
        formatError: (error) => `*Oops, something went wrong.*\n\n> ${error.message}`,
      },
    },
    threadContext: { maxMessages: 10 },
    handlers: { onMention, onSubscribedMessage, onDirectMessage },
  },
});
