import type { CoreSystemMessage } from '@mastra/core/llm';
import type { RequestContext } from '@mastra/core/request-context';
import { commandsPrompt } from './commands';
import { contextPrompt } from './context';
import { corePrompt } from './core';
import { guardrailsPrompt } from './guardrails';
import { personalityPrompt } from './personality';
import { slackPrompt } from './slack';
import { toolsPrompt } from './tools';

// TODO(slopradar): simplification: structure | the system prompt is assembled in two places: here (static blocks + context) and agents/orchestrator.ts orchestratorInstructions (code mode, github, user instructions, mcps, reasoning), so the prompt order is split across files | make this the single assembler, taking requestContext and doing the async parts, and have the orchestrator pass it straight to `instructions`
export function instructions(
  requestContext: RequestContext
): CoreSystemMessage[] {
  const context = contextPrompt(requestContext);
  const messages: CoreSystemMessage[] = [
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
  if (context) {
    messages.push({ role: 'system', content: context });
  }
  return messages;
}
