import type { AgentExecutionOptions } from '@mastra/core/agent';
import {
  ProviderHistoryCompat,
  TokenLimiterProcessor,
} from '@mastra/core/processors';
import { InMemoryStore } from '@mastra/core/storage';
import { Memory } from '@mastra/memory';
import { agent as config } from '../config';
import { defaultErrorProcessors } from '../lib/error-handling';
import { moveToolImages } from '../processors/tool-media';

export const agentDefaults = {
  errorProcessors: defaultErrorProcessors(),
  maxProcessorRetries: 2,
};

export const historyProcessors = [
  new TokenLimiterProcessor({
    limit: config.maxTokens.input,
    trimMode: 'contiguous',
  }),
  new ProviderHistoryCompat({ additionalRules: [moveToolImages] }),
];

export function runDefaults(maxOutputTokens: number): AgentExecutionOptions {
  return {
    modelSettings: {
      maxOutputTokens,
      topP: 0.95,
      reasoning: 'medium',
      timeout: config.modelTimeout,
    },
    maxSteps: config.maxSteps,
    autoResumeSuspendedTools: true,
    // The default strategy serialises every step once any approval tool (the
    // GitHub push) is registered; 'called' serialises only a step that calls one.
    toolCallConcurrency: { limit: 10, strategy: 'called' },
  };
}

// A subagent without memory of its own inherits the orchestrator's Postgres
// memory for each delegation, observational memory included. The orchestrator
// deletes each delegation thread from this store once the delegation completes.
export const delegationMemory = new Memory({ storage: new InMemoryStore() });
