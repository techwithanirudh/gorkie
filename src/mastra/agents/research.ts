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
import { description, prompt } from '../prompts/agents/research';
import { slackToolPrompt } from '../prompts/slack';
import { scout } from '../providers';
import { saveArtifactTool } from '../tools/artifacts';
import { slackCodeMode, slackCodeModePrompt } from '../tools/code-mode/slack';
import { fetchUrlTool } from '../tools/fetch-url';
import { searchWebTool } from '../tools/search-web';
import { slackTools } from '../tools/slack';

export const research = new Agent({
  id: 'research',
  name: 'Research',
  description,
  instructions: async () => [
    prompt,
    slackToolPrompt,
    await slackCodeModePrompt(),
  ],
  model: scout,
  errorProcessors: defaultErrorProcessors(),
  maxProcessorRetries: 2,
  // TODO(slopradar): review: performance | Mastra injects a fresh {resource, thread} per delegation because defaultOptions.memory is unset (agent-DwtTO5Px.js:37810, docs-subagents.md 'Fresh thread per invocation'), so every delegation adds a thread to this process-lifetime InMemoryStore and nothing evicts it | if the point is to keep delegation threads out of Postgres, say so in a one-line vendor-fact comment and bound or periodically clear the store; otherwise drop memory
  memory: new Memory({ storage: new InMemoryStore() }),
  tools: async () => ({
    slack: (await slackCodeMode()).tool,
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
  // TODO(slopradar): simplification: duplicated logic (3 uses) | errorProcessors, maxProcessorRetries, the TokenLimiter + ProviderHistoryCompat pair, modelSettings, maxSteps, autoResumeSuspendedTools and toolCallConcurrency are copied across orchestrator, research and explore, and have already drifted (research has no topP) | share one `agentDefaults`/`agentInputProcessors` in agents/ and spread it
  inputProcessors: [
    new TokenLimiterProcessor({
      limit: config.maxTokens.input,
      trimMode: 'contiguous',
    }),
    new ProviderHistoryCompat({ additionalRules: [moveToolImages] }),
  ],
  defaultOptions: {
    modelSettings: {
      maxOutputTokens: config.maxTokens.subagentOutput,
      // TODO(slopradar): review: dead config | overridden by the ladder entries' maxRetries: 3 (see agents/orchestrator.ts annotation, agent-DwtTO5Px.js:26720) | delete
      maxRetries: 5,
      reasoning: 'medium',
      timeout: config.modelTimeout,
    },
    maxSteps: config.maxSteps,
    autoResumeSuspendedTools: true,
    toolCallConcurrency: { limit: 10, strategy: 'called' },
  },
  // TODO(slopradar): review: correctness | a subagent's requestContext is a copy carrying the parent's `channel` entry (agent-DwtTO5Px.js:37572), so when this subagent finishes, the `sandbox` output processor runs endSandboxTurn on the PARENT's thread: it always closes the thread's browser session (ending the live view mid-turn, workspace/index.ts endSandboxTurn), and pauses the parent's sandbox mid-turn whenever the subagent touched it | drop `sandbox` from subagent outputProcessors; the orchestrator's processor, onAbort and onError already end the turn
  outputProcessors: [stepGuard, sandbox, workingModel('research')],
});
