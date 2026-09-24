import { Agent } from '@mastra/core/agent';
import {
  ProviderHistoryCompat,
  TokenLimiterProcessor,
} from '@mastra/core/processors';
import { InMemoryStore } from '@mastra/core/storage';
import { Memory } from '@mastra/memory';
import { agent as config } from '../config';
import { defaultErrorProcessors } from '../lib/error-handling';
import { sandbox } from '../processors/sandbox';
import { stepGuard } from '../processors/step-guard';
import { moveToolImages } from '../processors/tool-media';
import { workingModel } from '../processors/working-model';
import { description, prompt } from '../prompts/agents/explore';
import { explorer } from '../providers';
import { saveArtifactTool } from '../tools/artifacts';
import { fetchUrlTool } from '../tools/fetch-url';
import { searchWebTool } from '../tools/search-web';
import { workspace } from '../workspace';

export const explore = new Agent({
  id: 'explore',
  name: 'Explore',
  description,
  instructions: prompt,
  model: explorer,
  errorProcessors: defaultErrorProcessors(),
  maxProcessorRetries: 2,
  memory: new Memory({ storage: new InMemoryStore() }),
  workspace,
  tools: {
    search_web: searchWebTool,
    fetch_url: fetchUrlTool,
    save_artifact: saveArtifactTool,
  },
  inputProcessors: [
    new TokenLimiterProcessor({
      limit: config.maxTokens.input,
      trimMode: 'contiguous',
    }),
    new ProviderHistoryCompat({ additionalRules: [moveToolImages] }),
  ],
  defaultOptions: {
    activeTools: [
      'read_file',
      'list_files',
      'grep',
      'file_stat',
      'search_web',
      'fetch_url',
      'save_artifact',
    ],
    modelSettings: {
      maxOutputTokens: config.maxTokens.subagentOutput,
      maxRetries: 5,
      reasoning: 'medium',
      topP: 0.95,
      timeout: config.modelTimeout,
    },
    maxSteps: config.maxSteps,
    autoResumeSuspendedTools: true,
    toolCallConcurrency: { limit: 10, strategy: 'called' },
  },
  outputProcessors: [stepGuard, sandbox, workingModel('explore')],
});
