import { Agent } from '@mastra/core/agent';
import {
  ProviderHistoryCompat,
  TokenLimiterProcessor,
} from '@mastra/core/processors';
import { InMemoryStore } from '@mastra/core/storage';
import { Memory } from '@mastra/memory';
import { agent as config } from '../config';
import { defaultErrorProcessors } from '../lib/error-handling';
import { stepCountIs } from '../lib/tools';
import { sandbox } from '../processors/sandbox';
import { workingModel } from '../processors/working-model';
import * as explore from '../prompts/agents/explore';
import { explorer } from '../providers';
import { fetchUrlTool } from '../tools/fetch-url';
import { grepTool } from '../tools/grep';
import { searchWebTool } from '../tools/search-web';
import { workspace } from '../workspace';

export const exploreAgent = new Agent({
  id: 'explore',
  name: 'Explore',
  description: explore.description,
  instructions: explore.prompt,
  model: explorer,
  errorProcessors: defaultErrorProcessors(),
  maxProcessorRetries: 2,
  memory: new Memory({ storage: new InMemoryStore() }),
  workspace,
  tools: {
    grep: grepTool,
    search_web: searchWebTool,
    fetch_url: fetchUrlTool,
  },
  inputProcessors: [
    new TokenLimiterProcessor({
      limit: config.maxTokens.input,
      trimMode: 'contiguous',
    }),
    new ProviderHistoryCompat(),
  ],
  defaultOptions: {
    activeTools: [
      'read_file',
      'write_file',
      'edit_file',
      'delete_file',
      'list_files',
      'grep',
      'file_stat',
      'search_web',
      'fetch_url',
    ],
    modelSettings: {
      maxOutputTokens: 16_384,
      maxRetries: 5,
      reasoning: 'medium',
      topP: 0.95,
    },
    stopWhen: stepCountIs(config.maxSteps),
    autoResumeSuspendedTools: true,
  },
  outputProcessors: [sandbox, workingModel('explore')],
});
