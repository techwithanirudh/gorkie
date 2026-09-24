import { Agent, type AgentExecutionOptions } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { skillResultRedactor } from '@mastra/memory/hooks';
import { Chat } from 'chat';
import { slack } from '../chat/client';
import {
  onAction,
  onDirectMessage,
  onMention,
  onSubscribedMessage,
} from '../chat/handlers';
import { onSlashCommand } from '../chat/moderation/commands';
import { status } from '../chat/status';
import {
  agent as config,
  summarizer as summarizerConfig,
  toolDisplay as toolDisplayConfig,
} from '../config';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import { chatLogger } from '../lib/logger/chat';
import { userMCPTools } from '../mcp/user-servers/tools';
import { profileSchema } from '../memory/profile';
import { delegatedTools } from '../processors/delegated-tools';
import { outputBudget } from '../processors/output-budget';
import { sandbox } from '../processors/sandbox';
import { staleMessages } from '../processors/stale-messages';
import { stepGuard } from '../processors/step-guard';
import { toolDisplay } from '../processors/tool-display';
import { searchOnly, toolSearch } from '../processors/tool-search';
import { turnFooter } from '../processors/turn-footer';
import { workingModel } from '../processors/working-model';
import { instructions } from '../prompts';
import {
  observerPrompt,
  reflectorPrompt,
  titlePrompt,
} from '../prompts/memory';
import { models, summarizer as summarizerModel } from '../providers';
import { githubTools } from '../tools/github';
import { orchestratorTools } from '../tools/toolsets';
import { mastraToolDisplay } from '../types';
import { endSandboxTurn, workspace } from '../workspace';
import { explore } from './explore';
import { research } from './research';
import {
  agentDefaults,
  delegationMemory,
  historyProcessors,
  runDefaults,
} from './shared';

type StopCondition = Exclude<
  NonNullable<AgentExecutionOptions['stopWhen']>,
  unknown[]
>;

export const orchestrator = new Agent({
  id: config.id,
  name: 'Orchestrator',
  instructions: ({ requestContext }) => instructions(requestContext),
  model: models.orchestrator,
  ...agentDefaults,
  defaultOptions: ({ requestContext }) => ({
    ...runDefaults(config.maxTokens.output),
    delegation: {
      messageFilter: ({ messages }) =>
        messages.filter(({ role }) => role === 'user').slice(-1),
      onDelegationComplete: async ({ result }) => {
        if (!result.subAgentThreadId) {
          return;
        }
        await delegationMemory
          .deleteThread(result.subAgentThreadId)
          .catch((error: unknown) => {
            logger.debug('[orchestrator] failed to drop a delegation thread', {
              error,
            });
          });
      },
    },
    stopWhen: ({ steps }: Parameters<StopCondition>[0]) =>
      steps
        .at(-1)
        ?.toolResults?.some(
          ({ toolName }) => toolName === 'skip' || toolName === 'wait'
        ) ?? false,
    onAbort: async () => {
      await endSandboxTurn(requestContext);
      const { threadId } = channelContext(requestContext);
      if (!threadId) {
        return;
      }
      try {
        await Chat.getSingleton()
          .thread(threadId)
          .post(
            '_that turn stopped before I finished. ask again to pick it back up._'
          );
      } catch (error) {
        logger.debug('[orchestrator] failed to post abort notice', { error });
      }
    },
    onError: async () => {
      await endSandboxTurn(requestContext);
    },
  }),
  workspace,
  inputProcessors: [
    staleMessages,
    toolSearch,
    outputBudget,
    ...historyProcessors,
  ],
  outputProcessors: [
    toolDisplay,
    stepGuard,
    delegatedTools,
    sandbox,
    turnFooter,
    workingModel(config.id),
  ],
  tools: async ({ requestContext }) => {
    const ctx = channelContext(requestContext);
    const { channelId, threadId, userId } = ctx;
    const isDM = ctx.isDM === true;
    const base = await orchestratorTools();
    if (!userId) {
      return base;
    }
    const [userTools, github] = await Promise.all([
      userMCPTools({ isDM, userId }),
      githubTools({
        channelId,
        isDM,
        requestContext,
        threadId,
        userId,
      }),
    ]);
    searchOnly({
      names: Object.keys({ ...userTools, ...github }).filter(
        (name) => !(name in base)
      ),
      requestContext,
    });
    return { ...userTools, ...github, ...base };
  },
  agents: { research, explore },
  memory: new Memory({
    options: {
      messageHistory: { maxTokens: config.maxTokens.history },
      generateTitle: {
        model: summarizerModel[0].model,
        instructions: titlePrompt,
      },
      // Resource scope follows channels' default resourceId, the Slack user
      // whose message created the memory thread, so the profile travels with
      // them across threads and DMs. The schema holds preferences only for that
      // reason.
      workingMemory: {
        enabled: true,
        scope: 'resource',
        schema: profileSchema,
      },
      observationalMemory: {
        model: summarizerModel,
        hooks: { beforeObservation: skillResultRedactor() },
        activateAfterIdle: 'auto',
        activateOnProviderChange: true,
        observation: {
          observeAttachments: ['image/*'],
          threadTitle: true,
          manageWorkingMemory: true,
          instruction: observerPrompt,
          modelSettings: { maxOutputTokens: summarizerConfig.maxTokens.output },
          previousObserverTokens: summarizerConfig.maxTokens.previousObserver,
        },
        reflection: {
          instruction: reflectorPrompt,
          modelSettings: { maxOutputTokens: summarizerConfig.maxTokens.output },
        },
        temporalMarkers: true,
        scope: 'thread',
      },
    },
  }),
  channels: {
    tools: false,
    chatOptions: {
      fallbackStreamingPlaceholderText: 'working...',
      logger: chatLogger,
    },
    adapters: {
      slack: {
        adapter: slack,
        streaming: true,
        toolDisplay: mastraToolDisplay[toolDisplayConfig.default],
        typingStatus: status,
        formatError: (error) =>
          `*Oops, something went wrong.*\n\n> ${error.message}`,
      },
    },
    // Slack-shaped ids (`slack:C...:ts`) line up the memory thread with the
    // Slack thread and its Langfuse session. Runs only when a thread is first
    // created; later turns find it through the channel_externalThreadId mapping.
    resolveThreadId: ({ thread }) => thread.id,
    threadContext: { maxMessages: 0 },
    handlers: {
      onMention,
      onSubscribedMessage,
      onDirectMessage,
      onSlashCommand,
      onAction,
    },
  },
});
