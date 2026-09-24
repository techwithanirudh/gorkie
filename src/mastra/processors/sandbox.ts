import type { ProcessOutputResultArgs } from '@mastra/core/processors';
import { pauseSandbox } from '../workspace';

export const sandbox = {
  id: 'sandbox',
  name: 'Sandbox Lifecycle',
  description: 'Pauses the sandbox once the turn finishes.',
  async processOutputResult(args: ProcessOutputResultArgs) {
    const { requestContext, messages } = args;
    if (requestContext) {
      await pauseSandbox(requestContext);
    }
    return messages;
  },
};
