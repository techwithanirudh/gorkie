import type { CoreSystemMessage } from '@mastra/core/llm';
import { commandsPrompt } from './commands';
import { corePrompt } from './core';
import { guardrailsPrompt } from './guardrails';
import { personalityPrompt } from './personality';
import { slackPrompt } from './slack';
import { toolsPrompt } from './tools';

export function instructions(): CoreSystemMessage[] {
  return [
    {
      role: 'system',
      content: [
        corePrompt,
        personalityPrompt,
        slackPrompt,
        commandsPrompt,
        toolsPrompt,
        guardrailsPrompt,
      ].join('\n\n'),
    },
  ];
}
