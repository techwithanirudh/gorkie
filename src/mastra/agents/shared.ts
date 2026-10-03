import type { AgentExecutionOptions } from '@mastra/core/agent';
import {
  ProviderHistoryCompat,
  TokenLimiterProcessor,
} from '@mastra/core/processors';
import { InMemoryStore } from '@mastra/core/storage';
import { Memory } from '@mastra/memory';
import { agent as config } from '../config';
import { errorProcessors } from '../lib/error-handling';
import { moveToolImages } from '../processors/tool-media';

export const agentDefaults = {
  errorProcessors,
  maxProcessorRetries: config.maxProcessorRetries,
};

export const providerCompat = new ProviderHistoryCompat({
  additionalRules: [moveToolImages],
});

export const historyProcessors = [
  new TokenLimiterProcessor({
    limit: config.maxTokens.input,
    trimMode: 'contiguous',
  }),
  providerCompat,
];

export function runDefaults(maxOutputTokens: number): AgentExecutionOptions {
  return {
    modelSettings: {
      maxOutputTokens,
      topP: config.topP,
      reasoning: config.reasoning,
      timeout: config.modelTimeout,
    },
    maxSteps: config.maxSteps,
    autoResumeSuspendedTools: true,
    // The default strategy serialises every step once any approval tool (the
    // GitHub push) is registered; 'called' serialises only a step that calls one.
    toolCallConcurrency: {
      limit: config.toolCallConcurrency,
      strategy: 'called',
    },
  };
}

// A subagent without memory of its own inherits the orchestrator's Postgres
// memory for each delegation, observational memory included.
export const delegationMemory = new Memory({ storage: new InMemoryStore() });
