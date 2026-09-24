import type { CoreSystemMessage } from '@mastra/core/llm';
import type { RequestContext } from '@mastra/core/request-context';
import { getInstructions } from '../db/queries/settings';
import { channelContext } from '../lib/context';
import { logger } from '../lib/logger';
import { workspaceCodeModePrompt } from '../tools/code-mode/slack';
import { commandsPrompt } from './commands';
import { contextPrompt } from './context';
import { corePrompt } from './core';
import { githubPrompt } from './github';
import { guardrailsPrompt } from './guardrails';
import { mcpPrompt } from './mcp';
import { personalityPrompt } from './personality';
import { reasoningPrompt } from './reasoning';
import { slackPrompt } from './slack';
import { toolsPrompt } from './tools';

export async function instructions(
  requestContext: RequestContext
): Promise<CoreSystemMessage[]> {
  const ctx = channelContext(requestContext);
  const isDM = ctx.isDM === true;
  const { userId } = ctx;
  const [codeMode, github, userInstructions, mcps] = await Promise.all([
    workspaceCodeModePrompt(),
    githubPrompt({ isDM, requestContext, userId }),
    userId
      ? getInstructions(userId).catch((error: unknown) => {
          logger.warn('[prompts] failed to load user instructions', {
            error,
            userId,
          });
        })
      : undefined,
    userId ? mcpPrompt({ isDM, userId }) : undefined,
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
      `<user_instructions>\nThe person who sent this message set these for you in App Home. They are explicit, so they win over the working-memory profile, which is inferred and belongs to whoever brought you into this thread.\n${userInstructions}\n</user_instructions>`,
    mcps,
    reasoningPrompt,
  ].flatMap((content) => (content ? [{ role: 'system', content }] : []));
}
