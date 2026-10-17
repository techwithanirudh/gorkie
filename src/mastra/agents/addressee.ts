import { Agent } from '@mastra/core/agent';
import { defaultErrorProcessors } from '../lib/error-handling';
import * as addressee from '../prompts/agents/addressee';
import { summarizer as fastModel } from '../providers';

// Decides whether an unnamed huddle utterance is aimed at gorkie. It runs on
// the summarizer's flash models because it sits between someone finishing a
// sentence and gorkie starting to answer.
export const addresseeAgent = new Agent({
  id: 'addressee',
  name: 'Addressee',
  description: 'Decides whether a huddle utterance is spoken to gorkie.',
  instructions: addressee.prompt,
  model: fastModel,
  errorProcessors: defaultErrorProcessors(),
  defaultOptions: {
    modelSettings: { maxOutputTokens: 4, maxRetries: 1, reasoning: 'none' },
  },
});
