import { Agent } from '@mastra/core/agent';
import { TokenLimiterProcessor } from '@mastra/core/processors';
import { agent as config } from '../config';
import { stepCountIs } from '../lib/tools';
import { sandbox } from '../processors/sandbox';
import { orchestrator } from '../providers';
import { baseTools } from '../tools/base';
import { workspace } from '../workspace';

export const exploreAgent = new Agent({
  id: 'explore',
  name: 'Explore',
  description:
    'Reads workspace files and gathers implementation context without making changes.',
  instructions:
    'You are Explore. Inspect the workspace and gather context. Do not modify files, delete files, upload files, post messages, or run risky commands. Return concise findings with file paths, facts, and uncertainties.',
  model: orchestrator,
  workspace,
  tools: baseTools,
  inputProcessors: [
    new TokenLimiterProcessor({
      limit: config.maxTokens.input,
      trimMode: 'contiguous',
    }),
  ],
  defaultOptions: {
    activeTools: [
      'read_file',
      'list_files',
      'grep',
      'file_stat',
      'search_web',
      'search_slack',
      'read_conversation_history',
      'list_threads',
      'get_user',
      'get_channel_info',
    ],
    modelSettings: { maxOutputTokens: 16_384 },
    stopWhen: stepCountIs(80),
  },
  outputProcessors: [sandbox],
});
