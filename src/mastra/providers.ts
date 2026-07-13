import type { ModelWithRetries } from '@mastra/core/agent';
import { env } from '@/env';

type GatewayConfig = ModelWithRetries['model'] & { id: `${string}/${string}` };

function gateways(id: `${string}/${string}`): GatewayConfig[] {
  return [
    {
      id,
      apiKey: env.HACKCLUB_API_KEY,
      url: 'https://ai.hackclub.com/proxy/v1',
    },
    { id, apiKey: env.OPENROUTER_API_KEY, url: env.OPENROUTER_BASE_URL },
  ];
}

function inference(id: `${string}/${string}`): GatewayConfig[] {
  return env.INFERENCE_API_KEY && env.INFERENCE_BASE_URL
    ? [{ id, apiKey: env.INFERENCE_API_KEY, url: env.INFERENCE_BASE_URL }]
    : [];
}

export const orchestrator: ModelWithRetries[] = [
  ...inference('openrouter/minimax/minimax-m3').map((model) => ({
    model,
    maxRetries: 3,
    providerOptions: {
      openrouter: { reasoningEffort: 'medium' },
    },
  })),
  ...gateways('openrouter/minimax/minimax-m3').map((model) => ({
    model,
    maxRetries: 3,
    providerOptions: {
      openrouter: { reasoningEffort: 'medium' },
    },
  })),
];

export const summarizer: ModelWithRetries[] = [
  ...inference('openrouter/google/gemini-3.1-flash-lite').map((model) => ({
    model,
    maxRetries: 3,
  })),
  ...gateways('openrouter/google/gemini-3.1-flash-lite').map((model) => ({
    model,
    maxRetries: 3,
  })),
];

export const scout: ModelWithRetries[] = [
  ...inference('openrouter/deepseek/deepseek-v4-flash').map((model) => ({
    model,
    maxRetries: 3,
  })),
  ...gateways('openrouter/deepseek/deepseek-v4-flash').map((model) => ({
    model,
    maxRetries: 3,
  })),
];

export const explorer: ModelWithRetries[] = [
  ...inference('openrouter/minimax/minimax-m3').map((model) => ({
    model,
    maxRetries: 3,
  })),
  ...gateways('openrouter/minimax/minimax-m3').map((model) => ({
    model,
    maxRetries: 3,
  })),
];

export const images = {
  id: 'google/gemini-3.1-flash-image',
  apiKey: env.HACKCLUB_API_KEY,
  url: 'https://ai.hackclub.com/proxy/v1',
};
