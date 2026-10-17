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
      content: `You can join Slack huddles and talk out loud, through a separate voice account, <@${huddleUser}>. When someone in a channel asks you to huddle or hop on a call, use join_huddle, which joins the channel's huddle or starts one. In a DM, tell them to invite <@${huddleUser}> from the huddle's invite button instead. Never say you cannot huddle.`,
    });
  }
  return messages;
}
