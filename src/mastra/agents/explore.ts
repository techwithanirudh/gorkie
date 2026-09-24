import { Agent } from '@mastra/core/agent';
import { agent as config } from '../config';
import { stepGuard } from '../processors/step-guard';
import { workingModel } from '../processors/working-model';
import { description, prompt } from '../prompts/agents/explore';
import { models } from '../providers';
import { saveArtifactTool } from '../tools/artifacts';
import { fetchUrlTool } from '../tools/fetch-url';
import { searchWebTool } from '../tools/search-web';
import { workspace } from '../workspace';
import {
  agentDefaults,
  delegationMemory,
  historyProcessors,
  runDefaults,
} from './shared';

export const explore = new Agent({
  id: 'explore',
  name: 'Explore',
  description,
  instructions: prompt,
  model: models.explore,
  ...agentDefaults,
  memory: delegationMemory,
  workspace,
  tools: {
    search_web: searchWebTool,
    fetch_url: fetchUrlTool,
    save_artifact: saveArtifactTool,
  },
  inputProcessors: historyProcessors,
  defaultOptions: {
    ...runDefaults(config.maxTokens.subagentOutput),
    activeTools: [
      'read_file',
      'list_files',
      'grep',
      'file_stat',
      'search_web',
      'fetch_url',
      'save_artifact',
    ],
  },
  // No `sandbox` processor: a subagent's request context carries the parent's
  // channel, so ending the turn here would end the parent's turn mid-run.
  outputProcessors: [stepGuard, workingModel('explore')],
});
