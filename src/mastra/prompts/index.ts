import type { CoreSystemMessage } from '@mastra/core/llm';
import type { RequestContext } from '@mastra/core/request-context';
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
  return messages;
}
