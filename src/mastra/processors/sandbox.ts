import type { ProcessOutputResultArgs } from '@mastra/core/processors';
import { endSandboxTurn } from '../workspace';

export const sandbox = {
  id: 'sandbox',
  name: 'Sandbox Lifecycle',
  description: 'Pauses the sandbox once the turn finishes.',
  async processOutputResult(args: ProcessOutputResultArgs) {
    const { requestContext, messages } = args;
    if (requestContext) {
      await endSandboxTurn(requestContext);
    }
    return messages;
  },
};
