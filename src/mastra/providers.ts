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
    model: `opencode-go/${modelId}`,
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

function ladder(agentKey: string): ModelWithRetries[] {
  return [
    { ...opencode('deepseek-v4.1-flash', agentKey), maxRetries: 3 },
    { ...opencode('mimo-v2.6-flash', agentKey), maxRetries: 3 },
    { model: hackclub('google/gemini-3.5-flash-lite'), maxRetries: 3 },
  ];
}

const orchestratorModels = ladder('orchestrator');

export const orchestrator = () => preferLastWorking(orchestratorModels);

export const summarizer: ModelWithRetries[] = [
  { ...opencode('mimo-v2.6-flash', 'summarizer'), maxRetries: 3 },
  { model: hackclub('google/gemini-3.5-flash-lite'), maxRetries: 3 },
];

const scoutModels = ladder('research');

export const scout = () => preferLastWorking(scoutModels);

const explorerModels = ladder('explore');

export const explorer = () => preferLastWorking(explorerModels);

export const images = {
  model: hackclub('google/gemini-3.1-flash-image', {
    extraBody: { modalities: ['image', 'text'] },
  }),
};
