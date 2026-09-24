import type { Duration } from '@mastra/core/storage';
import { env } from '@/env';
import type { ToolDisplayMode } from './types';
export const sandbox = {
  template: 'gorkie-workspace:2.1',
  executionTimeout: 15 * 60 * 1000,
  timeout: 16 * 60 * 1000,
  // A job outlives its turn, so the VM lifetime is re-armed while one runs.
  // The cap matches E2B Hobby's one-hour sandbox limit.
  background: {
    maxTimeoutSeconds: 60 * 60,
    keepaliveMs: 10 * 60 * 1000,
    outputTailChars: 10_000,
    // Mastra's task timeout must outlast the command's own deadline, or the
    // task fails before the tool can return the timed-out output.
    taskTimeoutBufferSeconds: 120,
    // E2B kills the process only if our own abort never reached it.
    spawnBackstopSeconds: 60,
  },
  // A cold clone or a large push runs well past E2B's 60s request default, and
  // a timeout there retries the whole clone inside the credential window.
  cloneDepth: 50,
  gitTimeout: 5 * 60 * 1000,
  workdir: '/home/user',
};

export const liveView = {
  cdpPort: 9222,
  cloakServe: { path: '/usr/local/bin/cloakserve', version: '0.5.10' },
  startupTimeoutMs: 30_000,
  versionProbeTimeoutMs: 5000,
  refreshMs: 15_000,
};

export const upload = {
  maxBytes: 1_000_000_000,
};

export const file = {
  maxReadBytes: 10 * 1024 * 1024,
  maxGrepOutputBytes: 16 * 1024 * 1024,
};

export const canvas = {
  maxReadChars: 200_000,
};

export const artifacts = {
  maxChars: 200_000,
};

export const image = {
  maxViewBytes: 10 * 1024 * 1024,
  maxEditBytes: 8 * 1024 * 1024,
  // Vision models cap inline images per request (GLM: 8 images, 64 MiB total,
  // non-retryable 400 over that). Keep only the most recent within these bounds.
  maxContextImages: 8,
  maxContextBytes: 60 * 1024 * 1024,
};

export const agent = {
  // TODO(slopradar): CODING_STANDARDS: config for tuneable values | an agent id is not a per-deployment knob: it keys memory threads, the channels webhook path (scripts/dev-e2e.sh:6 hardcodes /api/agents/orchestrator/...), Langfuse and the working-model processor id, and research/explore keep theirs as literals in their agent files | inline 'orchestrator' in agents/orchestrator.ts (and 'summarizer' in agents/summarizer.ts), drop agent.id and summarizer.id here
  id: 'orchestrator',
  // TODO(slopradar): review: correctness | input 950,000 plus output 65,536 is 1,015,536, over the 1,000,000 context of opencode-go glm-5.3-flash and deepseek-v4-flash-vision-exp (models.dev), so a full-history turn on either rung can be rejected; TokenLimiterProcessor also counts with its own tokenizer, not GLM's | cap input at context minus output minus a margin, e.g. 900_000, and note the arithmetic next to the AGENTS.md 1M rule
  maxTokens: { input: 950_000, output: 65_536, subagentOutput: 16_384 },
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
  maxActivePerUser: 10,
};

export const workingModel = {
  ttl: 5 * 60 * 1000,
};

export const github = {
  installUrl: `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`,
  refreshBeforeExpiryMs: 5 * 60 * 1000,
};

export const mcp = {
  maxServers: 10,
  refreshBeforeExpiryMs: 60 * 1000,
  oauthRequestTimeoutMs: 10_000,
  probeTimeoutMs: 2000,
};

export const emoji = {
  listTtl: 5 * 60 * 1000,
  maxUploadBytes: 10 * 1024 * 1024,
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
  fetchMaxChars: 8000,
};

export const search = {
  snippetChars: 1200,
};

export const slack = {
  maxCachedThreads: 10_000,
  recipientTtlMs: 30 * 24 * 60 * 60 * 1000,
  userLookupConcurrency: 4,
  unresolvedUserTtlMs: 60 * 1000,
  profileTtlMs: 24 * 60 * 60 * 1000,
  failedProfileTtlMs: 60 * 1000,
  callsPerTurn: 200,
  apiPreviewChars: 16_384,
  codeModeMaxResultChars: 60_000,
};

export const history = {
  maxScannedMessages: 30,
  maxUnseenMessages: 10,
};

export const shutdown = {
  // How long SIGTERM waits for Slack turns to finish (TurnDrainWorker) before
  // aborting them. systemd's TimeoutStopSec must exceed twice this plus 5s:
  // Mastra spends up to one window on HTTP, then another on its own shutdown.
  drainTimeoutMs: env.NODE_ENV === 'production' ? 120_000 : 10_000,
  abortLeadMs: 10_000,
};

export const observability: { traceRetention: Duration } = {
  traceRetention: '7d',
};
