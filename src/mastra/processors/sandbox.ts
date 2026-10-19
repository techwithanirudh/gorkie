import type { Processor } from '@mastra/core/processors';
import { endSandboxTurn } from '../workspace';

export const sandbox = {
  id: 'sandbox',
  name: 'Sandbox Lifecycle',
  description: 'Pauses the sandbox once the turn finishes.',
  async processOutputResult({ requestContext, messages }) {
    if (requestContext) {
      await endSandboxTurn(requestContext);
    }
    return messages;
  },
} satisfies Processor<'sandbox'>;
