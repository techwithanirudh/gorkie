import type { ModelWithRetries } from '@mastra/core/agent';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { env } from '@/env';
import { channelContext } from './lib/context';
import { recallModel, slugOf } from './lib/working-model';

const hackclubBaseURL = 'https://ai.hackclub.com/proxy/v1';

const hackclub = createOpenRouter({
  apiKey: env.HACKCLUB_API_KEY,
  baseURL: hackclubBaseURL,
});

function opencode({
  modelId,
  fallbackSession,
}: {
  modelId: string;
  fallbackSession: string;
}): ModelWithRetries {
  return {
    model: { id: `opencode-go/${modelId}`, apiKey: env.OPENCODE_API_KEY },
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
  if (typeof model === 'object' && 'id' in model) {
    return slugOf(model.id);
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
  return [...matches, ...rest];
}

function ladder(agentKey: string): () => Promise<ModelWithRetries[]> {
  const models: ModelWithRetries[] = [
    {
      ...opencode({ modelId: 'glm-5.3-flash', fallbackSession: agentKey }),
      maxRetries: 3,
    },
    { model: hackclub('z-ai/glm-5.3-flash'), maxRetries: 3 },
    // Last resort only: opencode-go drops deepseek's reasoning_content on the
    // round trip, so it 400s on tool-calling turns and reliably serves only
    // single-shot replies.
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

export const models = {
  orchestrator: ladder('orchestrator'),
  research: ladder('research'),
  explore: ladder('explore'),
};

export const summarizer: ModelWithRetries[] = [
  { model: hackclub('google/gemini-3.5-flash-lite'), maxRetries: 3 },
  {
    ...opencode({ modelId: 'mimo-v2.5', fallbackSession: 'summarizer' }),
    maxRetries: 3,
  },
];

export const images = {
  model: 'google/gemini-3.1-flash-image',
  baseURL: hackclubBaseURL,
};
