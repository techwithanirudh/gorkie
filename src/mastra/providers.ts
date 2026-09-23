import type { ModelWithRetries } from '@mastra/core/agent';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { env } from '@/env';
import { channelContext } from './lib/context';
import { recallModel, slugOf } from './lib/working-model';

export const hackclub = createOpenRouter({
  apiKey: env.HACKCLUB_API_KEY,
  baseURL: 'https://ai.hackclub.com/proxy/v1',
});

function opencode({
  modelId,
  fallbackSession,
}: {
  modelId: string;
  fallbackSession: string;
}): ModelWithRetries {
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

function ladder(agentKey: string): () => Promise<ModelWithRetries[]> {
  const models: ModelWithRetries[] = [
    {
      ...opencode({ modelId: 'glm-5.3-flash', fallbackSession: agentKey }),
      maxRetries: 3,
    },
    { model: hackclub('z-ai/glm-5.3-flash'), maxRetries: 3 },
    // Last resort only. deepseek 400s on tool-calling turns (the reasoning_content
    // round-trip the opencode-go generic converter drops, see IMPLEMENTED.md), so
    // it only reliably serves single-shot replies, but unlike muse-spark it does
    // not train on submitted data.
    {
      ...opencode({
        modelId: 'deepseek-v4-flash-vision-exp',
        fallbackSession: agentKey,
      }),
      maxRetries: 3,
    },
  ];
  return () => preferLastWorking(models);
}

export const orchestrator = ladder('orchestrator');

export const scout = ladder('research');

export const explorer = ladder('explore');

export const summarizer: ModelWithRetries[] = [
  { model: hackclub('google/gemini-3.5-flash-lite'), maxRetries: 3 },
  {
    ...opencode({ modelId: 'mimo-v2.5', fallbackSession: 'summarizer' }),
    maxRetries: 3,
  },
];

export const images = {
  model: 'google/gemini-3.1-flash-image',
  baseURL: 'https://ai.hackclub.com/proxy/v1',
};
