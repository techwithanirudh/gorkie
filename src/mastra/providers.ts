import type { ModelWithRetries } from '@mastra/core/agent';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { env } from '@/env';
import { channelContext } from './lib/context';
import { recallModel, slugOf } from './lib/working-model';

export const hackclub = createOpenRouter({
  apiKey: env.HACKCLUB_API_KEY,
  baseURL: 'https://ai.hackclub.com/proxy/v1',
});

function opencode(modelId: string, fallbackSession: string): ModelWithRetries {
  return {
    model: `opencode-go/${modelId}` as const,
    headers: ({ requestContext }) => ({
      'user-agent': 'gorkie/1.0',
      'x-opencode-session':
        channelContext(requestContext).threadId ?? `gorkie:${fallbackSession}`,
    }),
  };
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
    const same =
      slug === lastGoodSlug ||
      slug?.endsWith(`/${lastGoodSlug}`) ||
      lastGoodSlug.endsWith(`/${slug}`);
    (slug && same ? matches : rest).push(entry);
  }
  return matches.length ? [...matches, ...rest] : models;
}

const orchestratorModels: ModelWithRetries[] = [
  { ...opencode('glm-5.3-flash', 'orchestrator'), maxRetries: 3 },
  { model: hackclub('openai/gpt-5.6-luna'), maxRetries: 3 },
  {
    ...opencode('deepseek-v4-flash-vision-exp', 'orchestrator'),
    maxRetries: 3,
  },
  {
    ...opencode('muse-spark-1.3-contributor', 'orchestrator'),
    maxRetries: 3,
  },
];

export const orchestrator = () =>
  preferLastWorking({ agentKey: 'orchestrator', models: orchestratorModels });

export const summarizer: ModelWithRetries[] = [
  { model: hackclub('google/gemini-3.5-flash-lite'), maxRetries: 3 },
  { ...opencode('mimo-v2.5', 'summarizer'), maxRetries: 3 },
];

const scoutModels: ModelWithRetries[] = [
  { model: hackclub('openai/gpt-5.6-luna'), maxRetries: 3 },
  {
    ...opencode('deepseek-v4-flash-vision-exp', 'research'),
    maxRetries: 3,
  },
  { ...opencode('muse-spark-1.3-contributor', 'research'), maxRetries: 3 },
];

export const scout = () =>
  preferLastWorking({ agentKey: 'research', models: scoutModels });

const explorerModels: ModelWithRetries[] = [
  { model: hackclub('openai/gpt-5.6-luna'), maxRetries: 3 },
  {
    ...opencode('deepseek-v4-flash-vision-exp', 'explore'),
    maxRetries: 3,
  },
  { ...opencode('muse-spark-1.3-contributor', 'explore'), maxRetries: 3 },
];

export const explorer = () =>
  preferLastWorking({ agentKey: 'explore', models: explorerModels });

export const images = {
  model: 'google/gemini-3.1-flash-image',
  baseURL: 'https://ai.hackclub.com/proxy/v1',
};
