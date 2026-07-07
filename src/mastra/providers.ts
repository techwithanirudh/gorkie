import type { ModelWithRetries } from '@mastra/core/agent';
import { env } from '@/env';

type ModelConfig = ModelWithRetries['model'] & { id: `${string}/${string}` };

function gateways(id: `${string}/${string}`): ModelConfig[] {
  return [
    {
      id,
      apiKey: env.HACKCLUB_API_KEY,
      url: 'https://ai.hackclub.com/proxy/v1',
    },
    { id, apiKey: env.OPENROUTER_API_KEY, url: env.OPENROUTER_BASE_URL }

  ];
}

function opencode(id: `${string}/${string}`): ModelConfig {
  return {
    id,
    apiKey: env.OPENCODE_API_KEY,
    url: 'https://opencode.ai/zen/go/v1',
  };
}

export const orchestrator: ModelWithRetries[] = [
  ...gateways('openrouter/moonshotai/kimi-k2.7-code').map((model) => ({
    model,
    maxRetries: 3,
    providerOptions: {
      openrouter: { reasoningEffort: 'medium' },
    },
  })),
  { model: opencode('opencode-go/kimi-k2.7-code'), maxRetries: 3 },
];

export const summarizer: ModelWithRetries[] = [
  ...gateways('openrouter/google/gemini-2.5-flash').map((model) => ({
    model,
    maxRetries: 3,
  })),
  { model: opencode('opencode-go/minimax-m3'), maxRetries: 3 }
];

export const scout: ModelWithRetries[] = [
  ...gateways('openrouter/minimax/minimax-m3').map((model) => ({
    model,
    maxRetries: 3,
  })),
  { model: opencode('opencode-go/minimax-m3'), maxRetries: 3 }
];

export const explorer: ModelWithRetries[] = [
  ...gateways('openrouter/minimax/minimax-m3').map((model) => ({
    model,
    maxRetries: 3,
  })),
  { model: opencode('opencode-go/minimax-m3'), maxRetries: 3 }
];

export const images = {
  id: 'google/gemini-3.1-flash-image',
  apiKey: env.HACKCLUB_API_KEY,
  url: 'https://ai.hackclub.com/proxy/v1',
};
