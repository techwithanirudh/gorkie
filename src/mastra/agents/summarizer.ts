import { Agent } from '@mastra/core/agent';
import { ProviderHistoryCompat } from '@mastra/core/processors';
import { summarizer as config } from '../config';
import { moveToolImages } from '../processors/tool-media';
import { description, prompt } from '../prompts/agents/summarizer';
import { summarizer as summarizerModel } from '../providers';
import { agentDefaults } from './shared';

export const summarizer = new Agent({
  id: 'summarizer',
  name: 'Summarizer',
  description,
  instructions: prompt,
  model: summarizerModel,
  ...agentDefaults,
  inputProcessors: [
    new ProviderHistoryCompat({ additionalRules: [moveToolImages] }),
  ],
  defaultOptions: {
    modelSettings: { maxOutputTokens: config.maxTokens.output },
  },
});
