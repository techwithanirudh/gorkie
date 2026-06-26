import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { workspace } from '../workspace';
import { weatherTool } from '../tools/weather';
import { slack } from '../channels/slack';
import {
  onNewMention,
  onSubscribedMessage,
  onDirectMessage,
} from '../channels/handlers';
import { buildInstructions } from '../prompts';

export const gorkieAgent = new Agent({
  id: 'gorkie',
  name: 'gorkie',
  // Dynamic: stable identity prefix (cached) + volatile per-request context.
  instructions: ({ requestContext }) => buildInstructions(requestContext),
  // Array form enables per-model retries (and future fallbacks).
  model: [{ model: 'openrouter/minimax/minimax-m3', maxRetries: 3 }],
  workspace,
  tools: { weatherTool },
  memory: new Memory({
    options: {
      // Short verbatim window; Observational Memory compresses older history.
      lastMessages: 20,
      observationalMemory: {
        model: 'openrouter/google/gemini-2.5-flash',
        temporalMarkers: true,
        // Thread scope: each Slack thread keeps its own observation log.
        scope: 'thread',
      },
    },
  }),
  // Mastra channels owns the Slack message flow: Socket Mode, streaming, live
  // tool widgets, typing status, thread-history backfill (with multi-user
  // prefixing), approval cards, and MastraStateAdapter.
  channels: {
    adapters: {
      slack: {
        adapter: slack,
        // Both are the Slack defaults; set explicitly to document intent.
        streaming: true,
        toolDisplay: 'grouped',
      },
    },
    // Re-fetch up to 10 recent messages when gorkie is pinged into a thread it
    // isn't already following (handled automatically by the subscription logic).
    threadContext: { maxMessages: 10 },
    // Subscription model (see channels/handlers.ts): pinged at a thread's start →
    // follow every message; pinged mid-thread → answer that ping only and
    // re-fetch context next time; `##` messages ignored everywhere.
    handlers: {
      onMention: onNewMention,
      onSubscribedMessage,
      onDirectMessage,
    },
  },
});
