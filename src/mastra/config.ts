import { env } from '@/env';
export const sandbox = {
  template: 'gorkie-workspace:2.0',
  executionTimeout: 15 * 60 * 1000,
  timeout: 16 * 60 * 1000,
  // A cold clone or a large push runs well past E2B's 60s request default, and
  // a timeout there retries the whole clone inside the credential window.
  gitTimeout: 5 * 60 * 1000,
  workdir: '/home/user',
};

export const upload = {
  maxBytes: 1_000_000_000,
};

export const file = {
  // Without a cap, `fallocate -l 8G x && read_file x` OOMs the host (reachable
  // from injected repo content).
  maxReadBytes: 10 * 1024 * 1024,
};

export const image = {
  maxEditBytes: 8 * 1024 * 1024,
  requestTimeoutMs: 5 * 60 * 1000,
  // Cap on an image inlined into the model context, matching Mastra read_file's
  // 10MB media default; a larger file is refused rather than blowing up context.
  maxViewBytes: 10 * 1024 * 1024,
  // Vision models cap inline images per request (GLM: 8 images, 64 MiB total,
  // non-retryable 400 over that). Keep only the most recent within these bounds.
  maxContextImages: 8,
  maxContextBytes: 60 * 1024 * 1024,
};

export const agent = {
  id: 'orchestrator',
  maxTokens: { input: 1_000_000, output: 65_536 },
  maxSteps: 1000,
  modelTimeout: { firstChunkMs: 2 * 60 * 1000, stepMs: 5 * 60 * 1000 },
};

export const summarizer = {
  id: 'summarizer',
  maxTokens: { output: 32_768 },
};

export const scheduledTasks = {
  minInterval: env.NODE_ENV === 'production' ? 30 * 60 * 1000 : 60 * 1000,
};

export const workingModel = {
  ttl: 30 * 60 * 1000,
};

export const emoji = { listTtl: 5 * 60 * 1000 };

export const huddle = {
  voice: 'aura-2-thalia-en',
  sttModel: 'flux-general-en',
  // Spoken replies are a few sentences, so a small cap also bounds the cost
  // of a runaway turn. Steps cover a delegation plus the reply after it.
  maxOutputTokens: 1024,
  maxSteps: 4,
  lastMessages: 40,
  task: { researchTimeout: 15 * 60 * 1000, exploreTimeout: 20 * 60 * 1000 },
  // Without its name, an utterance still gets an answer this soon after
  // gorkie last spoke, so follow-ups flow without "hey gorkie" every time.
  followUpWindow: 20 * 1000,
  // Idle-gated "still working" lines while a delegation runs: the first
  // after this much quiet, then the interval, at most `count` of them.
  filler: { first: 5000, interval: 10_000, count: 3 },
  // Leave once nobody else has been in the call this long.
  aloneTimeout: 60 * 1000,
  idleTimeout: 15 * 60 * 1000,
};
