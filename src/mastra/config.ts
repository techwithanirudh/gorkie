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
  model: 'minimax-m3',
  voice: 'flux-alexis-en',
  sttModel: 'flux-general-en',
  eotThreshold: 0.7,
  eotTimeoutMs: 5000,
  // Flux dropped or misheard the name ("Gorky", nothing) without a keyterm.
  keyterm: ['Gorkie', 'Gork'],
  // Characters Flux must have heard before talking over gorkie cuts it off,
  // so a cough or a click does not kill a reply.
  bargeInChars: 4,
  // Flux TTS closes a socket with no client message for 60 s.
  ttsKeepAliveMs: 30 * 1000,
  batchSttModel: 'nova-3',
  maxOutputTokens: 1024,
  maxSteps: 4,
  lastMessages: 40,
  task: { researchTimeout: 15 * 60 * 1000, exploreTimeout: 20 * 60 * 1000 },
  unnamedReplyWindow: 20 * 1000,
  goodbye: { afterLeaveMs: 2000, afterAudioMs: 1500, maxMs: 10 * 1000 },
  aloneTimeout: 60 * 1000,
  idleTimeout: 15 * 60 * 1000,
};
