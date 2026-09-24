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

// TODO(slopradar): review: correctness (open, TODO.md Production Langfuse audit item 2) | any rung that answers once is pinned for workingModel.ttl across every thread, agent and user, so one Hack Club fallback reply keeps the whole bot on the fallback after the primary recovers | only pin or reorder toward a non-primary rung when the primary is the one failing, e.g. skip pinModelOnce unless the answering slug is models[0], and drop the `matches.length ? ... : models` ternary below (with no matches, [...matches, ...rest] already equals models)
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
    // TODO(slopradar): CODING_STANDARDS: comments | the comment justifies deepseek against muse-spark, which is not on the ladder any more, and points at IMPLEMENTED.md instead of stating the fact | keep the vendor fact (opencode-go drops reasoning_content, so deepseek 400s on tool-calling turns) and delete the muse-spark and IMPLEMENTED.md clauses
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

// TODO(slopradar): CODING_STANDARDS: naming (direct names) | `scout`/`explorer` are a second vocabulary for the research/explore agents, and the arg is only a fallback session header | export the ladders under the agent names, e.g. `export const models = { orchestrator: ladder('orchestrator'), research: ladder('research'), explore: ladder('explore') }`
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
  baseURL: hackclubBaseURL,
};
