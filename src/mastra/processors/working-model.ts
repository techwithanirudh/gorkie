import type { ProcessOutputResultArgs } from '@mastra/core/processors';
import { rememberModel } from '../lib/working-model';

function providerOf(response: unknown): string | undefined {
  if (typeof response !== 'object' || response === null) {
    return;
  }
  const { modelMetadata } = response as { modelMetadata?: unknown };
  if (typeof modelMetadata !== 'object' || modelMetadata === null) {
    return;
  }
  const { modelProvider } = modelMetadata as { modelProvider?: unknown };
  return typeof modelProvider === 'string' ? modelProvider : undefined;
}

export function workingModel(agentKey: string) {
  return {
    id: `working-model-${agentKey}`,
    name: 'Working Model',
    description:
      'Remembers the model that just answered so the next run tries it first.',
    async processOutputResult(args: ProcessOutputResultArgs) {
      if (args.result.finishReason === 'error') {
        return args.messages;
      }
      const response = args.result.steps.at(-1)?.response;
      const modelId = response?.modelId;
      if (modelId) {
        await rememberModel({
          agentKey,
          modelId,
          modelProvider: providerOf(response),
        });
      }
      return args.messages;
    },
  };
}
