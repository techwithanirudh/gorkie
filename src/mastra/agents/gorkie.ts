import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { workspace, sandboxLifecycle } from '../workspace';
import { tools } from '../tools';
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
  instructions: ({ requestContext }) => buildInstructions(requestContext),
  // model: [{ model: 'openrouter/moonshotai/kimi-k2.6', maxRetries: 3 }],
  model: [{ model: 'openrouter/google/gemini-3-flash-preview', maxRetries: 3 }],
  defaultOptions: { maxSteps: 150 },
  workspace,
  outputProcessors: [sandboxLifecycle],
  tools,
  memory: new Memory({
    options: {
      lastMessages: 20,
      observationalMemory: {
        model: 'openrouter/google/gemini-2.5-flash',
        temporalMarkers: true,
        scope: 'thread',
      },
    },
  }),
  channels: {
    adapters: {
      slack: { adapter: slack, streaming: true, toolDisplay: 'grouped' },
    },
    threadContext: { maxMessages: 10 },
    handlers: { onMention: onNewMention, onSubscribedMessage, onDirectMessage },
  },
});
