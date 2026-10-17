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
  voice: 'flux-sienna-en',
  sttModel: 'flux-general-en',
  // The talker's lead model on OpenCode Go, swappable here. MiniMax M3 was
  // the fastest to first token in a live comparison (under a second, 1M
  // context). The usual ladder backs it up.
  model: 'minimax-m3',
  // Flux end-of-turn confidence, and the silence after which a turn ends
  // regardless. The likeliest knobs to turn after a live test.
  eotThreshold: 0.7,
  eotTimeoutMs: 5000,
  batchSttModel: 'nova-3',
  // Spoken replies are a few sentences, so a small cap also bounds the cost
  // of a runaway turn. Two steps covers a delegation plus a line after it.
  maxOutputTokens: 1024,
  maxSteps: 2,
  // Short on purpose: every turn pays for this context in model latency,
  // and a huddle rarely refers back further. Observational memory folds
  // what falls out of the window.
  lastMessages: 12,
  // Lines said since the talker last ran, sent with the next addressed
  // turn. Older side talk is dropped rather than paid for.
  backlogLines: 40,
  // A delegation runs gorkie's full agent; past this it is given up on.
  delegateTimeout: 20 * 60 * 1000,
  // Without its name, an utterance still gets an answer this soon after
  // gorkie last spoke, so follow-ups flow without "hey gorkie" every time.
  followUpWindow: 20 * 1000,
  // Inside that window a fast model reads the last few lines to tell a
  // follow-up from side chatter. Outside it, only the name gets a reply.
  addressee: { lines: 8, timeout: 1500 },
  // Characters Flux must have heard before talking over gorkie cuts it off.
  bargeInChars: 4,
  // Clears the "is thinking..." status if a reply never comes.
  thinkingTimeout: 20 * 1000,
  // After being asked to leave, the most a goodbye gets to finish playing.
  leaveTimeout: 10 * 1000,
  // Leave once nobody else has been in the call this long.
  aloneTimeout: 60 * 1000,
  idleTimeout: 15 * 60 * 1000,
};
