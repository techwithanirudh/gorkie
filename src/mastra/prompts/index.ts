import type { CoreSystemMessage, SystemMessage } from '@mastra/core/llm';
import type { RequestContext } from '@mastra/core/request-context';
import { contextPrompt } from './context';
import { corePrompt } from './core';
import { guardrailsPrompt } from './guardrails';
import { personalityPrompt } from './personality';
import { slackPrompt } from './slack';
import { toolsPrompt } from './tools';

export function buildInstructions(
  requestContext: RequestContext
): SystemMessage {
  const context = contextPrompt(requestContext);
  const messages: CoreSystemMessage[] = [
    {
      role: 'system',
      content: [
        corePrompt,
        guardrailsPrompt,
        personalityPrompt,
        slackPrompt,
        toolsPrompt,
      ].join('\n\n'),
    },
  ];
  if (context) {
    messages.push({ role: 'system', content: context });
  }
  return messages;
}
