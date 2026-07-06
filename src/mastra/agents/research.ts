import { Agent } from '@mastra/core/agent';
import { TokenLimiterProcessor } from '@mastra/core/processors';
import { InMemoryStore } from '@mastra/core/storage';
import { Memory } from '@mastra/memory';
import { agent as config } from '../config';
import { stepCountIs } from '../lib/tools';
import { scout } from '../providers';
import { baseTools } from '../tools/base';

export const researchAgent = new Agent({
  id: 'research',
  name: 'Research',
  description:
    'Runs focused Slack, web, user, channel, and thread research, then returns compact sourced findings.',
  instructions:
    'You are Research. Gather facts using Slack, web, user, channel, and thread tools. Prefer compact sourced findings over raw dumps. Include links, thread ids, channel names, dates, and uncertainty when available. Do not edit files, run commands, upload files, or post messages. Keep total tool calls under 300, then write up your findings.',
  model: scout,
  // In-memory only: every delegate call is a fresh, one-shot thread that's
  // never revisited, so there's no reason to persist it to real storage.
  memory: new Memory({ storage: new InMemoryStore() }),
  tools: baseTools,
  inputProcessors: [
    new TokenLimiterProcessor({
      limit: config.maxTokens.input,
      trimMode: 'contiguous',
    }),
  ],
  defaultOptions: {
    activeTools: [
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
});
