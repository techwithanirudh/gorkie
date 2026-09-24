import { env } from '@/env';
import type { ToolDisplayMode } from './types';
export const sandbox = {
  template: 'gorkie-workspace:2.1',
  executionTimeout: 15 * 60 * 1000,
  timeout: 16 * 60 * 1000,
  // A job outlives its turn, so the VM lifetime is re-armed while one runs.
  // The cap matches E2B Hobby's one-hour sandbox limit.
  background: { maxTimeoutSeconds: 60 * 60, keepaliveMs: 10 * 60 * 1000 },
  // A cold clone or a large push runs well past E2B's 60s request default, and
  // a timeout there retries the whole clone inside the credential window.
  cloneDepth: 50,
  gitTimeout: 5 * 60 * 1000,
  workdir: '/home/user',
};

export const liveView = {
  cdpPort: 9222,
  cloakServe: { path: '/usr/local/bin/cloakserve', version: '0.5.5' },
  startupTimeoutMs: 30_000,
  refreshMs: 15_000,
};

export const upload = {
  maxBytes: 1_000_000_000,
};

export const file = {
  maxReadBytes: 10 * 1024 * 1024,
};

export const canvas = {
  maxReadChars: 200_000,
};

export const image = {
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

export const toolDisplay: { default: ToolDisplayMode } = { default: 'hidden' };

export const summarizer = {
  id: 'summarizer',
  maxTokens: { output: 32_768 },
};

export const scheduledTasks = {
  minInterval: env.NODE_ENV === 'production' ? 30 * 60 * 1000 : 60 * 1000,
};

export const workingModel = {
  ttl: 5 * 60 * 1000,
};

export const github = {
  installUrl: `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`,
};

export const mcp = {
  maxServers: 10,
};

export const emoji = {
  listTtl: 5 * 60 * 1000,
  proxyUrl: 'https://hackclub-slack-emoji-proxy.vercel.app/api/emoji',
};

export const usage = {
  turnsPerHour: 40,
  turnsPerDay: 300,
  maxOutputTokensPerTurn: 200_000,
};

export const exa = {
  timeoutMs: 30_000,
  livecrawlTimeoutMs: 15_000,
};
