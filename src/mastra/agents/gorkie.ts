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
import { agent as config } from '../config';
import { stepCountIs, toolCall } from '../lib/tools';
import { outputProcessors } from '../processors';
import { buildInstructions } from '../prompts';
import { orchestrator, summarizer } from '../providers';
import { baseTools } from '../tools/base';
import { workspace } from '../workspace';
import { exploreAgent } from './explore';
import { researchAgent } from './research';

export const gorkieAgent = new Agent({
  id: 'gorkie',
  name: 'gorkie',
  instructions: ({ requestContext }) => buildInstructions(requestContext),
  model: orchestrator,
  defaultOptions: {
    modelSettings: { maxOutputTokens: config.maxTokens.output },
    stopWhen: [toolCall('skip'), stepCountIs(150)],
  },
  workspace,
  inputProcessors: [
    // TODO: Learn about TokenLimiterProcessor and it's modes
    new TokenLimiterProcessor({
      limit: config.maxTokens.input,
      trimMode: 'contiguous',
    }),
  ],
  outputProcessors,
  tools: baseTools,
  agents: {
    research: researchAgent,
    explore: exploreAgent,
  },
  memory: new Memory({
    options: {
      lastMessages: 20,
      observationalMemory: {
        model: summarizer,
        observation: {
          modelSettings: { maxOutputTokens: config.maxTokens.output },
        },
        reflection: {
          modelSettings: { maxOutputTokens: config.maxTokens.output },
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
