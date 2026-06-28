import { Agent, type ModelWithRetries } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { env } from '@/env';
import {
  onDirectMessage,
  onMention,
  onSubscribedMessage,
} from '../chat/handlers';
import { slack } from '../chat/slack';
import { toolDisplay } from '../chat/tool-display';
import { outputProcessors } from '../processors';
import { buildInstructions } from '../prompts';
import { tools } from '../tools';
import { workspace } from '../workspace';

export const gorkieAgent = new Agent({
  id: 'gorkie',
  name: 'gorkie',
  instructions: ({ requestContext }) => buildInstructions(requestContext),
  model: [
    {
      model: {
        id: 'openrouter/moonshotai/kimi-k2.6',
        apiKey: env.HACKCLUB_API_KEY,
        url: 'https://ai.hackclub.com/proxy/v1',
      },
      maxRetries: 3,
      providerOptions: { openrouter: { reasoningEffort: 'medium' } },
    },
    {
      model: {
        id: 'openrouter/moonshotai/kimi-k2.6',
        apiKey: env.OPENROUTER_API_KEY,
        url: env.OPENROUTER_BASE_URL,
      },
      maxRetries: 3,
      providerOptions: { openrouter: { reasoningEffort: 'medium' } },
    },
    ...(env.INFERENCE_API_KEY
      ? ([
          {
            model: {
              id: 'openrouter/moonshotai/kimi-k2.6',
              apiKey: env.INFERENCE_API_KEY,
              url: env.INFERENCE_BASE_URL,
            },
            maxRetries: 3,
            providerOptions: { openrouter: { reasoningEffort: 'medium' } },
          },
        ] satisfies ModelWithRetries[])
      : []),
    {
      model: {
        id: 'opencode-go/kimi-k2.6',
        apiKey: env.OPENCODE_API_KEY,
        url: 'https://opencode.ai/zen/go/v1',
      },
      maxRetries: 3,
    },
  ],
  defaultOptions: { maxSteps: 150 },
  workspace,
  outputProcessors,
  tools,
  memory: new Memory({
    options: {
      lastMessages: 20,
      observationalMemory: {
        model: [
          {
            model: {
              id: 'openrouter/google/gemini-2.5-flash',
              apiKey: env.HACKCLUB_API_KEY,
              url: 'https://ai.hackclub.com/proxy/v1',
            },
            maxRetries: 3,
          },
          {
            model: {
              id: 'openrouter/google/gemini-2.5-flash',
              apiKey: env.OPENROUTER_API_KEY,
              url: env.OPENROUTER_BASE_URL,
            },
            maxRetries: 3,
          },
          {
            model: {
              id: 'opencode-go/deepseek-v4-flash',
              apiKey: env.OPENCODE_API_KEY,
              url: 'https://opencode.ai/zen/go/v1',
            },
            maxRetries: 3,
          },
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
        formatError: (error) =>
          `*Oops, something went wrong.*\n\n> ${error.message}`,
      },
    },
    threadContext: { maxMessages: 10 },
    handlers: { onMention, onSubscribedMessage, onDirectMessage },
  },
});
