import type { CoreSystemMessage } from '@mastra/core/llm';
import type { RequestContext } from '@mastra/core/request-context';
import { huddleAccount } from '../huddle/account';
import { commandsPrompt } from './commands';
import { contextPrompt } from './context';
import { corePrompt } from './core';
import { guardrailsPrompt } from './guardrails';
import { personalityPrompt } from './personality';
import { reasoningPrompt } from './reasoning';
import { slackPrompt } from './slack';
import { toolsPrompt } from './tools';

export function instructions(
  requestContext: RequestContext
): CoreSystemMessage[] {
  const context = contextPrompt(requestContext);
  const messages: CoreSystemMessage[] = [
    {
      role: 'system',
      content: [
        corePrompt,
        reasoningPrompt,
        personalityPrompt,
        slackPrompt,
        commandsPrompt,
        toolsPrompt,
        guardrailsPrompt,
      ].join('\n\n'),
    },
  ];
  if (context) {
    messages.push({ role: 'system', content: context });
  }
  const huddleUser = huddleAccount.userId;
  if (huddleUser) {
    messages.push({
      role: 'system',
      content: `You can join Slack huddles and talk out loud, through a separate voice account, <@${huddleUser}>. You cannot start or join a huddle from a text message. When someone wants you in a huddle, tell them to start or open the huddle and invite <@${huddleUser}> from its invite button. Never say you cannot huddle.`,
    });
  }
  return messages;
}
