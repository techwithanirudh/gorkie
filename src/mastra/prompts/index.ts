import type { CoreSystemMessage } from '@mastra/core/llm';
import type { RequestContext } from '@mastra/core/request-context';
import { getUserSettings } from '../db/queries/settings';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import { codeModeInstructions } from '../tools/code-mode/slack';
import { commandsPrompt } from './commands';
import { contextPrompt } from './context';
import { corePrompt } from './core';
import { githubPrompt } from './github';
import { guardrailsPrompt } from './guardrails';
import { mcpPrompt } from './mcp';
import { personalityPrompt } from './personality';
import { slackPrompt } from './slack';
import { toolsPrompt } from './tools';

export async function instructions(
  requestContext: RequestContext
): Promise<CoreSystemMessage[]> {
  const { isDM, userId } = channelContext(requestContext);
  const [codeMode, github, userInstructions, mcps] = await Promise.all([
    codeModeInstructions({ workspaceAccess: true }),
    userId ? githubPrompt({ isDM, requestContext, userId }) : undefined,
    userId
      ? getUserSettings(userId)
          .then(({ instructions }) => instructions)
          .catch((error: unknown) => {
            logger.warn('[prompts] failed to load user instructions', {
              error,
              userId,
            });
          })
      : undefined,
    userId ? mcpPrompt({ isDM, requestContext, userId }) : undefined,
  ]);
  return [
    [
      corePrompt,
      personalityPrompt,
      slackPrompt,
      commandsPrompt,
      toolsPrompt,
      guardrailsPrompt,
    ].join('\n\n'),
    contextPrompt(requestContext),
    codeMode,
    github,
    userInstructions &&
      `<user_instructions>\nThe person who sent this message set these for you in App Home.\n${userInstructions}\n</user_instructions>`,
    mcps,
  ].flatMap((content) => (content ? [{ role: 'system', content }] : []));
}
