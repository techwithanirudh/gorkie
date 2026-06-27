import type { RequestContext } from '@mastra/core/request-context';
import type { CoreSystemMessage, SystemMessage } from '@mastra/core/llm';
import { corePrompt } from './core';
import { personalityPrompt } from './personality';
import { slackPrompt } from './slack';
import { examplesPrompt } from './examples';
import { contextPrompt } from './context';

export function buildInstructions(
  requestContext: RequestContext,
): SystemMessage {
  const context = contextPrompt(requestContext);
  const messages: CoreSystemMessage[] = [
    {
      role: 'system',
      content: [corePrompt, personalityPrompt, slackPrompt, examplesPrompt].join(
        '\n\n',
      ),
    },
  ];
  if (context) messages.push({ role: 'system', content: context });
  return messages;
}
