import type { SystemMessage } from '@mastra/core/llm';
import { corePrompt } from './core';
import { guardrailsPrompt } from './guardrails';
import { personalityPrompt } from './personality';
import { slackPrompt } from './slack';
import { toolsPrompt } from './tools';

export const instructions: SystemMessage = [
  corePrompt,
  guardrailsPrompt,
  personalityPrompt,
  slackPrompt,
  toolsPrompt,
].join('\n\n');
