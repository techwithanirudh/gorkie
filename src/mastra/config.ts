import { env } from '@/env';
export const sandbox = {
  template: 'gorkie-workspace:2.0',
  executionTimeout: 15 * 60 * 1000,
  timeout: 16 * 60 * 1000,
  // Longest a run_background job may run; the box is kept alive for it and
  // reaped after.
  backgroundTimeout: 30 * 60 * 1000,
  // A cold clone or a large push runs well past E2B's 60s request default, and
  // a timeout there retries the whole clone inside the credential window.
  gitTimeout: 5 * 60 * 1000,
  workdir: '/home/user',
};

export const upload = {
  maxBytes: 1_000_000_000,
};

export const image = {
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
  modelTimeout: { firstChunkMs: 60 * 1000, stepMs: 5 * 60 * 1000 },
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
