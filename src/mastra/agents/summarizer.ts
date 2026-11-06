import { Agent } from '@mastra/core/agent';
import { summarizer as config } from '../config';
import { description, prompt } from '../prompts/agents/summarizer';
import { summarizer as summarizerModel } from '../providers';
import { agentDefaults, providerCompat } from './shared';

export const summarizer = new Agent({
  id: 'summarizer',
  name: 'Summarizer',
  description,
  instructions: prompt,
  model: summarizerModel,
  ...agentDefaults,
  inputProcessors: [providerCompat],
  defaultOptions: {
    modelSettings: { maxOutputTokens: config.maxTokens.output },
  },
});
