import type { ModelWithRetries } from '@mastra/core/agent';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { env } from '@/env';
import { recallModel, sameModel, slugOf } from './lib/working-model';

export const hackclub = createOpenRouter({
  apiKey: env.HACKCLUB_API_KEY,
  baseURL: 'https://ai.hackclub.com/proxy/v1',
});

function opencode(modelId: string) {
  return `opencode-go/${modelId}` as const;
}

function modelSlug(entry: ModelWithRetries): string | undefined {
  const { model } = entry;
  if (typeof model === 'string') {
    return slugOf(model);
  }
  if (
    typeof model === 'object' &&
    model !== null &&
    'modelId' in model &&
    typeof model.modelId === 'string'
  ) {
    return slugOf(model.modelId);
  }
}

// Tries whichever model actually answered last time first, instead of
// re-discovering on every turn that the primary is rate-limited.
async function preferLastWorking({
  agentKey,
  models,
}: {
  agentKey: string;
  models: ModelWithRetries[];
}): Promise<ModelWithRetries[]> {
  const lastGoodSlug = await recallModel(agentKey);
  if (!lastGoodSlug) {
    return models;
  }
  const matches: ModelWithRetries[] = [];
  const rest: ModelWithRetries[] = [];
  for (const entry of models) {
    const slug = modelSlug(entry);
    (slug && sameModel(slug, lastGoodSlug) ? matches : rest).push(entry);
  }
  return matches.length ? [...matches, ...rest] : models;
}

const orchestratorModels: ModelWithRetries[] = [
  { model: hackclub('openai/gpt-5.6-luna'), maxRetries: 3 },
  { model: opencode('deepseek-v4-flash-vision-exp'), maxRetries: 3 },
  { model: opencode('ox-alpha-free'), maxRetries: 3 },
];

export const orchestrator = () =>
  preferLastWorking({ agentKey: 'orchestrator', models: orchestratorModels });

export const summarizer: ModelWithRetries[] = [
  { model: hackclub('google/gemini-3.5-flash-lite'), maxRetries: 3 },
  { model: opencode('mimo-v2.5'), maxRetries: 3 },
];

const scoutModels: ModelWithRetries[] = [
  { model: hackclub('openai/gpt-5.6-luna'), maxRetries: 3 },
  { model: opencode('deepseek-v4-flash-vision-exp'), maxRetries: 3 },
  { model: opencode('ox-alpha-free'), maxRetries: 3 },
];

export const scout = () =>
  preferLastWorking({ agentKey: 'research', models: scoutModels });

const explorerModels: ModelWithRetries[] = [
  { model: hackclub('openai/gpt-5.6-luna'), maxRetries: 3 },
  { model: opencode('muse-spark-1.2-contributor'), maxRetries: 3 },

  { model: opencode('ox-alpha-free'), maxRetries: 3 },
];

export const explorer = () =>
  preferLastWorking({ agentKey: 'explore', models: explorerModels });

export const images = {
  model: 'google/gemini-3.1-flash-image',
  baseURL: 'https://ai.hackclub.com/proxy/v1',
};
