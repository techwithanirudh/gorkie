import { Agent } from '@mastra/core/agent';
import { ProviderHistoryCompat } from '@mastra/core/processors';
import { summarizer as config } from '../config';
import { defaultErrorProcessors } from '../lib/error-handling';
import { moveToolImages } from '../processors/tool-media';
import { description, prompt } from '../prompts/agents/summarizer';
import { summarizer as summarizerModel } from '../providers';

export const summarizer = new Agent({
  id: 'summarizer',
  name: 'Summarizer',
  description,
  instructions: prompt,
  model: summarizerModel,
  errorProcessors: defaultErrorProcessors(),
  inputProcessors: [
    new ProviderHistoryCompat({ additionalRules: [moveToolImages] }),
  ],
  maxProcessorRetries: 2,
  defaultOptions: {
    modelSettings: { maxOutputTokens: config.maxTokens.output },
  },
});
