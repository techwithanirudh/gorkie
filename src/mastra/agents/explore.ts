import { Agent } from '@mastra/core/agent';
import {
  ProviderHistoryCompat,
  TokenLimiterProcessor,
} from '@mastra/core/processors';
import { InMemoryStore } from '@mastra/core/storage';
import { Memory } from '@mastra/memory';
import { agent as config, subagent } from '../config';
import { defaultErrorProcessors } from '../lib/error-handling';
import { stepCountIs } from '../lib/tools';
import { autoBackground } from '../processors/auto-background';
import { runLimits } from '../processors/run-limits';
import { sandbox } from '../processors/sandbox';
import { stepGuard } from '../processors/step-guard';
import { tokenUsage } from '../processors/token-usage';
import { moveToolImages } from '../processors/tool-media';
import { workingModel } from '../processors/working-model';
import * as explore from '../prompts/agents/explore';
import { explorer } from '../providers';
import { fetchUrlTool } from '../tools/fetch-url';
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
    search_web: searchWebTool,
    fetch_url: fetchUrlTool,
  },
  inputProcessors: [
    autoBackground,
    runLimits,
    new TokenLimiterProcessor({
      limit: config.maxTokens.input,
      trimMode: 'contiguous',
    }),
    new ProviderHistoryCompat({ additionalRules: [moveToolImages] }),
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
      timeout: config.modelTimeout,
    },
    // One past the limit, so the turn run-limits forces can still answer.
    stopWhen: stepCountIs(subagent.maxSteps + 1),
    autoResumeSuspendedTools: true,
  },
  outputProcessors: [stepGuard, tokenUsage, sandbox, workingModel('explore')],
});
