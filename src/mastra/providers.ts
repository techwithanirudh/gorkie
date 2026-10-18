import type { ModelWithRetries } from '@mastra/core/agent';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { env } from '@/env';
import { agent as config, huddle } from './config';
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
  api = 'chat',
}: {
  modelId: string;
  fallbackSession: string;
  api?: 'chat' | 'responses';
}): Rung {
  return {
    host: 'opencode.ai',
    slug: `opencode-go/${modelId}`,
    model: {
      model: {
        id: `opencode-go/${modelId}`,
        apiKey: env.OPENCODE_API_KEY,
        api,
        url: 'https://opencode.ai/zen/go/v1',
        headers: {
          'user-agent': 'gorkie/1.0',
          'x-opencode-session': `gorkie:${fallbackSession}`,
        },
      },
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

function rungs(agentKey: string): Rung[] {
  return [
    opencode({
      modelId: 'gpt-6-luna',
      fallbackSession: agentKey,
      api: 'responses',
    }),
    opencode({ modelId: 'mimo-v2.6-flash', fallbackSession: agentKey }),
    opencode({ modelId: 'kimi-k3', fallbackSession: agentKey }),
  ];
}

function ladder(agentKey: string): () => Promise<ModelWithRetries[]> {
  const agentRungs = rungs(agentKey);
  return () => preferLastWorking(agentRungs);
}

export const models = {
  orchestrator: ladder('orchestrator'),
  research: ladder('research'),
  explore: ladder('explore'),
};

// No preferLastWorking: the last working model is shared with the text agents,
// so it would rank their slower ladder ahead of the voice model. The first
// rung has no `url` on purpose: the registry sends minimax-m3 on OpenCode Go
// through the Anthropic SDK, and a custom url would force the
// OpenAI-compatible client instead.
export const voice: ModelWithRetries[] = [
  {
    model: {
      id: `opencode-go/${huddle.model}`,
      apiKey: env.OPENCODE_API_KEY,
      headers: {
        'user-agent': 'gorkie/1.0',
        'x-opencode-session': 'gorkie:voice',
      },
    },
    maxRetries: config.modelRetries,
  },
  ...rungs('voice').map(({ model }) => model),
];

export const summarizer: ModelWithRetries[] = [
  opencode({ modelId: 'mimo-v2.6-flash', fallbackSession: 'summarizer' }).model,
  hackclub('google/gemini-3.5-flash-lite').model,
];

export const images = {
  model: hackclubProvider('google/gemini-3.1-flash-image', {
    extraBody: { modalities: ['image', 'text'] },
  }),
};
