import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import {
  onDirectMessage,
  onMention,
  onSubscribedMessage,
} from '../chat/handlers';
import { slack } from '../chat/slack';
import { toolDisplay } from '../chat/tool-display';
import { memory, orchestrator } from '../lib/providers';
import { outputProcessors } from '../processors';
import { buildInstructions } from '../prompts';
import { tools } from '../tools';
import { workspace } from '../workspace';

export const gorkieAgent = new Agent({
  id: 'gorkie',
  name: 'gorkie',
  instructions: ({ requestContext }) => buildInstructions(requestContext),
  model: orchestrator,
  defaultOptions: {
    maxSteps: 150,
  },
  workspace,
  outputProcessors,
  tools,
  memory: new Memory({
    options: {
      lastMessages: 20,
      observationalMemory: {
        model: memory,
        temporalMarkers: true,
        scope: 'thread',
      },
    },
  }),
  channels: {
    adapters: {
      slack: {
        adapter: slack,
        streaming: true,
        toolDisplay,
        formatError: (error) =>
          `*Oops, something went wrong.*\n\n> ${error.message}`,
      },
    },
    threadContext: { maxMessages: 10 },
    handlers: { onMention, onSubscribedMessage, onDirectMessage },
  },
});
