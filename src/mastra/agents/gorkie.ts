import { createPostgresState } from '@chat-adapter/state-pg';
import { Agent } from '@mastra/core/agent';
import { TokenLimiterProcessor } from '@mastra/core/processors';
import { Memory } from '@mastra/memory';
import { env } from '@/env';
import { slack } from '../chat/client';
import {
  onDirectMessage,
  onMention,
  onSubscribedMessage,
} from '../chat/handlers';
import { toolDisplay } from '../chat/tool-display';
import { stepCountIs, toolCall } from '../lib/tools';
import { outputProcessors } from '../processors';
import { buildInstructions } from '../prompts';
import { memory, orchestrator } from '../providers';
import { tools } from '../tools';
import { workspace } from '../workspace';

export const gorkieAgent = new Agent({
  id: 'gorkie',
  name: 'gorkie',
  instructions: ({ requestContext }) => buildInstructions(requestContext),
  model: orchestrator,
  defaultOptions: {
    modelSettings: { maxOutputTokens: 32_768 },
    stopWhen: [toolCall('skip'), stepCountIs(150)],
  },
  workspace,
  inputProcessors: [
    // TODO: Learn about TokenLimiterProcessor and it's modes
    new TokenLimiterProcessor({ limit: 900_000, trimMode: 'contiguous' }),
  ],
  outputProcessors,
  tools,
  memory: new Memory({
    options: {
      lastMessages: 20,
      observationalMemory: {
        model: memory,
        observation: {
          modelSettings: { maxOutputTokens: 32_768 },
        },
        reflection: {
          modelSettings: { maxOutputTokens: 32_768 },
        },
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
