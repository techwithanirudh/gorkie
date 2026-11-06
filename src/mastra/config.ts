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

export const agentmail = {
  inbox: 'gorkie@agentmail.to',
  // Attachments travel base64-encoded inside one MCP request, a third larger.
  maxAttachmentBytes: 10 * 1024 * 1024,
};

export const agent = {
  id: 'orchestrator',
  maxTokens: { input: 1_000_000, output: 64_000 },
  maxOutputTokensPerTurn: 200_000,
  batchWindowMs: 500,
  maxSteps: 1000,
  modelTimeout: { firstChunkMs: 2 * 60 * 1000, stepMs: 5 * 60 * 1000 },
};

export const exa = {
  timeoutMs: 30_000,
  livecrawlTimeoutMs: 15_000,
};

export const gate = {
  id: 'gate',
  maxTokens: { output: 16 },
  contextMessages: 8,
  maxMessageChars: 1200,
  timeoutMs: 10_000,
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

export const activity = {
  updateIntervalMs: 1500,
  maxPhases: 8,
  maxTools: 32,
  elapsedIntervalMs: 5000,
  maxAnswerPreviewChars: 10_000,
  answerChunkChars: 1000,
  maxTitleChars: 96,
  maxTargetChars: 48,
};
