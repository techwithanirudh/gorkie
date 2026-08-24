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
import * as research from '../prompts/agents/research';
import { slackToolPrompt } from '../prompts/slack';
import { scout } from '../providers';
import { slackCodeMode, slackCodeModePrompt } from '../tools/code-mode/slack';
import { fetchUrlTool } from '../tools/fetch-url';
import { searchWebTool } from '../tools/search-web';
import { slackTools } from '../tools/slack';

export const researchAgent = new Agent({
  id: 'research',
  name: 'Research',
  description: research.description,
  instructions: [research.prompt, slackToolPrompt, slackCodeModePrompt],
  model: scout,
  errorProcessors: defaultErrorProcessors(),
  maxProcessorRetries: 2,
  memory: new Memory({ storage: new InMemoryStore() }),
  tools: {
    slack: slackCodeMode.tool,
    search_web: searchWebTool,
    fetch_url: fetchUrlTool,
    search_slack: slackTools.search_slack,
    read_conversation_history: slackTools.read_conversation_history,
    get_user: slackTools.get_user,
    get_channel_info: slackTools.get_channel_info,
    get_permalink: slackTools.get_permalink,
    summarize_thread: slackTools.summarize_thread,
  },
  inputProcessors: [
    new TokenLimiterProcessor({
      limit: config.maxTokens.input,
      trimMode: 'contiguous',
    }),
    new ProviderHistoryCompat(),
  ],
  defaultOptions: {
    modelSettings: {
      maxOutputTokens: 16_384,
      maxRetries: 5,
      reasoning: 'medium',
    },
    stopWhen: stepCountIs(config.maxSteps),
    autoResumeSuspendedTools: true,
  },
  outputProcessors: [sandbox, workingModel('research')],
});
