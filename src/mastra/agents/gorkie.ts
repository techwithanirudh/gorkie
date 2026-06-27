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
  instructions: ({ requestContext }) => buildInstructions(requestContext),
  model: [{ model: 'openrouter/minimax/minimax-m3', maxRetries: 3 }],
  workspace,
  tools: { weatherTool },
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
