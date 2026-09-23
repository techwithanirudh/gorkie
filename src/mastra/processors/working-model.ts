import type { ProcessOutputResultArgs } from '@mastra/core/processors';
import { z } from 'zod';
import { rememberModel } from '../lib/working-model';

const responseSchema = z.object({
  modelMetadata: z.object({ modelProvider: z.string() }).optional(),
});

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
          modelId,
          modelProvider:
            responseSchema.safeParse(response).data?.modelMetadata
              ?.modelProvider,
        });
      }
      return args.messages;
    },
  };
}
