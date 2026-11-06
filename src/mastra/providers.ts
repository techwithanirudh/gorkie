import type { ModelWithRetries } from '@mastra/core/agent';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { env } from '@/env';
import { recallModel, slugOf } from './lib/working-model';

export const hackclub = createOpenRouter({
  apiKey: env.HACKCLUB_API_KEY,
  baseURL: 'https://ai.hackclub.com/proxy/v1',
});

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

async function preferLastWorking(
  models: ModelWithRetries[]
): Promise<ModelWithRetries[]> {
  const lastGoodSlug = await recallModel();
  if (!lastGoodSlug) {
    return models;
  }
  const matches: ModelWithRetries[] = [];
  const rest: ModelWithRetries[] = [];
  for (const entry of models) {
    const slug = modelSlug(entry);
    const same =
      slug === lastGoodSlug ||
      slug?.endsWith(`/${lastGoodSlug}`) ||
      lastGoodSlug.endsWith(`/${slug}`);
    (slug && same ? matches : rest).push(entry);
  }
  return matches.length ? [...matches, ...rest] : models;
}

const agentModels: ModelWithRetries[] = [
  { model: 'vercel/vmc/gorkie', maxRetries: 3 },
  { model: hackclub('deepseek/deepseek-v4.1-flash'), maxRetries: 3 },
];

export const orchestrator = () => preferLastWorking(agentModels);

export const summarizer: ModelWithRetries[] = [
  { model: 'vercel/vmc/gorkie', maxRetries: 3 },
  { model: hackclub('google/gemini-3.5-flash-lite'), maxRetries: 3 },
];

export const scout = () => preferLastWorking(agentModels);

export const explorer = () => preferLastWorking(agentModels);

export const images = {
  model: hackclub('google/gemini-3.1-flash-image', {
    extraBody: { modalities: ['image', 'text'] },
  }),
};
