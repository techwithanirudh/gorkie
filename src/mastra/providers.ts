import type { ModelWithRetries } from '@mastra/core/agent';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { env } from '@/env';
import { agent as config } from './config';
import { channelContext } from './lib/context';
import { recallModel } from './processors/working-model';

const hackclubBaseURL = 'https://ai.hackclub.com/proxy/v1';

const hackclubProvider = createOpenRouter({
  apiKey: env.HACKCLUB_API_KEY,
  baseURL: hackclubBaseURL,
});

interface Rung {
  host: string;
  model: ModelWithRetries;
  slug: string;
}

// A provider that reports its quota spent keeps failing until it resets, and
// opencode takes about two minutes to return that 429, so its rungs sit out.
const benchedUntil = new Map<string, number>();

export function benchProvider(host: string): void {
  benchedUntil.set(host, Date.now() + config.quotaCooldownMs);
}

function opencode({
  modelId,
  fallbackSession,
}: {
  modelId: string;
  fallbackSession: string;
}): Rung {
  return {
    host: 'opencode.ai',
    slug: `opencode-go/${modelId}`,
    model: {
      model: { id: `opencode-go/${modelId}`, apiKey: env.OPENCODE_API_KEY },
      headers: ({ requestContext }) => ({
        'user-agent': 'gorkie/1.0',
        'x-opencode-session':
          channelContext(requestContext).threadId ??
          `gorkie:${fallbackSession}`,
      }),
      maxRetries: config.modelRetries,
    },
  };
}

function hackclub(modelId: string): Rung {
  return {
    host: URL.parse(hackclubBaseURL)?.host ?? hackclubBaseURL,
    slug: modelId,
    model: {
      model: hackclubProvider(modelId),
      maxRetries: config.modelRetries,
    },
  };
}

async function preferLastWorking(rungs: Rung[]): Promise<ModelWithRetries[]> {
  const now = Date.now();
  const available = rungs.filter(
    ({ host }) => (benchedUntil.get(host) ?? 0) <= now
  );
  const usable = available.length > 0 ? available : rungs;
  const lastGoodSlug = await recallModel();
  const same = ({ slug }: Rung) =>
    lastGoodSlug !== undefined &&
    (slug === lastGoodSlug ||
      slug.endsWith(`/${lastGoodSlug}`) ||
      lastGoodSlug.endsWith(`/${slug}`));
  return [...usable.filter(same), ...usable.filter((rung) => !same(rung))].map(
    ({ model }) => model
  );
}

function ladder(agentKey: string): () => Promise<ModelWithRetries[]> {
  const rungs = [
    opencode({ modelId: 'glm-5.3-flash', fallbackSession: agentKey }),
    hackclub('z-ai/glm-5.3-flash'),
    // Last resort only: opencode-go drops deepseek's reasoning_content on the
    // round trip, so it 400s on tool-calling turns and reliably serves only
    // single-shot replies.
    opencode({
      modelId: 'deepseek-v4-flash-vision-exp',
      fallbackSession: agentKey,
    }),
  ];
  return () => preferLastWorking(rungs);
}

export const models = {
  orchestrator: ladder('orchestrator'),
  research: ladder('research'),
  explore: ladder('explore'),
};

export const summarizer: ModelWithRetries[] = [
  hackclub('google/gemini-3.5-flash-lite').model,
  opencode({ modelId: 'mimo-v2.5', fallbackSession: 'summarizer' }).model,
];

export const images = {
  model: 'google/gemini-3.1-flash-image',
  baseURL: hackclubBaseURL,
};
