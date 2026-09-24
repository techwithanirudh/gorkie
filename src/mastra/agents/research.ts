import { Agent } from '@mastra/core/agent';
import { agent as config } from '../config';
import { stepGuard } from '../processors/step-guard';
import { workingModel } from '../processors/working-model';
import { description, prompt } from '../prompts/agents/research';
import { slackToolPrompt } from '../prompts/slack';
import { models } from '../providers';
import { saveArtifactTool } from '../tools/artifacts';
import { codeMode, codeModeInstructions } from '../tools/code-mode/slack';
import { fetchUrlTool } from '../tools/fetch-url';
import { searchWebTool } from '../tools/search-web';
import { slackTools } from '../tools/slack';
import {
  agentDefaults,
  delegationMemory,
  historyProcessors,
  runDefaults,
} from './shared';

export const research = new Agent({
  id: 'research',
  name: 'Research',
  description,
  instructions: async () => [
    prompt,
    slackToolPrompt,
    await codeModeInstructions({ workspaceAccess: false }),
  ],
  model: models.research,
  ...agentDefaults,
  memory: delegationMemory,
  tools: async () => ({
    slack: (await codeMode({ workspaceAccess: false })).tool,
    search_web: searchWebTool,
    fetch_url: fetchUrlTool,
    search_slack: slackTools.search_slack,
    read_conversation_history: slackTools.read_conversation_history,
    get_user: slackTools.get_user,
    get_channel_info: slackTools.get_channel_info,
    get_permalink: slackTools.get_permalink,
    summarize_thread: slackTools.summarize_thread,
    call_slack_api: slackTools.call_slack_api,
    save_artifact: saveArtifactTool,
  }),
  inputProcessors: historyProcessors,
  defaultOptions: runDefaults(config.maxTokens.subagentOutput),
  // No `sandbox` processor: a subagent's request context carries the parent's
  // channel, so ending the turn here would end the parent's turn mid-run.
  outputProcessors: [stepGuard, workingModel('research')],
});
