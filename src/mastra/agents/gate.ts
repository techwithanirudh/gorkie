import { Agent } from '@mastra/core/agent';
import { gate as config } from '../config';
import { defaultErrorProcessors } from '../lib/error-handling';
import { gatePrompt } from '../prompts/gate';
import { gate as gateModel } from '../providers';

export const gate = new Agent({
  id: config.id,
  name: 'Gate',
  description:
    'Decides whether gorkie should answer an unmentioned message in a thread it follows.',
  instructions: gatePrompt,
  model: gateModel,
  errorProcessors: defaultErrorProcessors(),
  defaultOptions: {
    modelSettings: { maxOutputTokens: config.maxTokens.output },
  },
});
