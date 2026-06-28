import type { ModelWithRetries } from '@mastra/core/agent';
import { env } from '@/env';

const glm: `${string}/${string}` = 'openrouter/z-ai/glm-5.2';
const gemini: `${string}/${string}` = 'openrouter/google/gemini-2.5-flash';

export const orchestrator: ModelWithRetries[] = [
  {
    model: {
      id: glm,
      apiKey: env.HACKCLUB_API_KEY,
      url: 'https://ai.hackclub.com/proxy/v1',
    },
    maxRetries: 3,
    providerOptions: {
      openrouter: { reasoningEffort: 'medium' },
    },
  },
  {
    model: {
      id: glm,
      apiKey: env.OPENROUTER_API_KEY,
      url: env.OPENROUTER_BASE_URL,
    },
    maxRetries: 3,
    providerOptions: {
      openrouter: { reasoningEffort: 'medium' },
    },
  },
  ...(env.INFERENCE_API_KEY
    ? new Array<ModelWithRetries>({
        model: {
          id: glm,
          apiKey: env.INFERENCE_API_KEY,
          url: env.INFERENCE_BASE_URL,
        },
        maxRetries: 3,
        providerOptions: {
          openrouter: { reasoningEffort: 'medium' },
        },
      })
    : []),
  {
    model: {
      id: 'opencode-go/glm-5.2',
      apiKey: env.OPENCODE_API_KEY,
      url: 'https://opencode.ai/zen/go/v1',
    },
    maxRetries: 3,
  },
];

export const summarizer: ModelWithRetries[] = [
  {
    model: {
      id: gemini,
      apiKey: env.HACKCLUB_API_KEY,
      url: 'https://ai.hackclub.com/proxy/v1',
    },
    maxRetries: 3,
  },
  {
    model: {
      id: gemini,
      apiKey: env.OPENROUTER_API_KEY,
      url: env.OPENROUTER_BASE_URL,
    },
    maxRetries: 3,
  },
  ...(env.INFERENCE_API_KEY
    ? new Array<ModelWithRetries>({
        model: {
          id: gemini,
          apiKey: env.INFERENCE_API_KEY,
          url: env.INFERENCE_BASE_URL,
        },
        maxRetries: 3,
      })
    : []),
  {
    model: {
      id: 'opencode-go/deepseek-v4-flash',
      apiKey: env.OPENCODE_API_KEY,
      url: 'https://opencode.ai/zen/go/v1',
    },
    maxRetries: 3,
  },
];

export const memory = summarizer;
