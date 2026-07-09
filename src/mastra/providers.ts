import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ModelWithRetries } from '@mastra/core/agent';
import { extractReasoningMiddleware, wrapLanguageModel } from 'ai';
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

const opencodeProvider = createOpenAICompatible({
  name: 'opencode-go',
  baseURL: 'https://opencode.ai/zen/go/v1',
  apiKey: env.OPENCODE_API_KEY,
});

function opencode(model: string): LanguageModelV3 {
  // opencode-go emits reasoning wrapped in <think>...</think> tags inline with
  // the assistant text. extractReasoningMiddleware strips those tags and exposes
  // the content as the structured `reasoning` field, matching AI SDK's native
  // reasoning support so Mastra's model loop can render reasoning separately
  // instead of leaking raw tags into the final Slack message.
  return wrapLanguageModel({
    model: opencodeProvider.chatModel(model),
    middleware: extractReasoningMiddleware({ tagName: 'think' }),
  });
}

export const orchestrator: ModelWithRetries[] = [
  ...gateways('openrouter/minimax/minimax-m3').map((model) => ({
    model,
    maxRetries: 3,
    providerOptions: {
      openrouter: { reasoningEffort: 'medium' },
    },
  })),
  { model: opencode('minimax-m3'), maxRetries: 3 },
];

export const summarizer: ModelWithRetries[] = [
  ...gateways('openrouter/google/gemini-3.1-flash-lite').map((model) => ({
    model,
    maxRetries: 3,
  })),
  { model: opencode('mimo-v2.5'), maxRetries: 3 },
];

export const scout: ModelWithRetries[] = [
  ...gateways('openrouter/deepseek/deepseek-v4-flash').map((model) => ({
    model,
    maxRetries: 3,
  })),
  { model: opencode('deepseek-v4-flash'), maxRetries: 3 },
];

export const explorer: ModelWithRetries[] = [
  ...gateways('openrouter/minimax/minimax-m3').map((model) => ({
    model,
    maxRetries: 3,
  })),
  { model: opencode('minimax-m3'), maxRetries: 3 },
];

export const images = {
  id: 'google/gemini-3.1-flash-image',
  apiKey: env.HACKCLUB_API_KEY,
  url: 'https://ai.hackclub.com/proxy/v1',
};
