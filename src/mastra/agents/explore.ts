import { Agent } from '@mastra/core/agent';
import {
  ProviderHistoryCompat,
  TokenLimiterProcessor,
} from '@mastra/core/processors';
import { InMemoryStore } from '@mastra/core/storage';
import { Memory } from '@mastra/memory';
import { agent as config } from '../config';
import { stepCountIs } from '../lib/tools';
import { sandbox } from '../processors/sandbox';
import { relocateToolResultImages } from '../processors/tool-media';
import { explorer } from '../providers';
import { baseTools } from '../tools/base';
import { workspace } from '../workspace';

export const exploreAgent = new Agent({
  id: 'explore',
  name: 'Explore',
  description:
    'Reads workspace files and gathers implementation context without making changes.',
  instructions:
    'You are Explore. Inspect the workspace and gather context. Do not modify files, delete files, upload files, post messages, or run risky commands. Keep total tool calls under 300, then write up your findings. Return concise findings with file paths, facts, and uncertainties.',
  model: explorer,
  // In-memory only: every delegate call is a fresh, one-shot thread that's
  // never revisited, so there's no reason to persist it to real storage.
  memory: new Memory({ storage: new InMemoryStore() }),
  workspace,
  tools: baseTools,
  inputProcessors: [
    new TokenLimiterProcessor({
      limit: config.maxTokens.input,
      trimMode: 'contiguous',
    }),
    new ProviderHistoryCompat({
      additionalRules: [relocateToolResultImages],
    }),
  ],
  defaultOptions: {
    activeTools: [
      'read_file',
      'list_files',
      'grep',
      'file_stat',
      'search_web',
      'fetch_url',
      'search_slack',
      'read_conversation_history',
      'list_threads',
      'get_user',
      'get_channel_info',
    ],
    modelSettings: { maxOutputTokens: 16_384 },
    stopWhen: stepCountIs(400),
  },
  outputProcessors: [sandbox],
});
