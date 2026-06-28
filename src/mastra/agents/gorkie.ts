import { createPostgresState } from '@chat-adapter/state-pg';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { env } from '@/env';
import {
  onDirectMessage,
  onMention,
  onSubscribedMessage,
} from '../chat/handlers';
import { slack } from '../chat/slack';
import { toolDisplay } from '../chat/tool-display';
import { memory, orchestrator } from '../lib/providers';
import { stepCountAtLeast, toolCall } from '../lib/tools';
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
    stopWhen: [toolCall('skip'), stepCountAtLeast(150)],
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
    state: createPostgresState({ url: env.DATABASE_URL }),
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
