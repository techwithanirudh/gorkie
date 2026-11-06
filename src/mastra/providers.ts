import type { ModelWithRetries } from '@mastra/core/agent';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { env } from '@/env';
import { agent as config } from './config';
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

// A provider that reports its quota spent keeps failing until it resets, so
// its rungs sit out.
const benchedUntil = new Map<string, number>();

export function benchProvider(host: string): void {
  benchedUntil.set(host, Date.now() + config.quotaCooldownMs);
}

// `vmc/gorkie` is a model config on the gateway that routes only to providers
// that do not train on prompts, and fails over between them itself.
function gateway(modelId: string): Rung {
  return {
    host: 'ai-gateway.vercel.sh',
    slug: `vercel/${modelId}`,
    model: {
      model: { id: `vercel/${modelId}`, apiKey: env.AI_GATEWAY_API_KEY },
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

const agentRungs = [
  gateway('vmc/gorkie'),
  hackclub('deepseek/deepseek-v4.1-flash'),
];

export const models = {
  orchestrator: () => preferLastWorking(agentRungs),
  research: () => preferLastWorking(agentRungs),
  explore: () => preferLastWorking(agentRungs),
};

// No preferLastWorking: the last working model is shared with the text agents,
// and voice should not be reordered by what they last used.
export const voice: ModelWithRetries[] = agentRungs.map(({ model }) => model);

export const summarizer: ModelWithRetries[] = [
  gateway('vmc/gorkie').model,
  hackclub('google/gemini-3.5-flash-lite').model,
];

export const images = {
  model: hackclubProvider('google/gemini-3.1-flash-image', {
    extraBody: { modalities: ['image', 'text'] },
  }),
};
