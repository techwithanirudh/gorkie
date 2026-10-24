import type { Processor } from '@mastra/core/processors';
import { Chat } from 'chat';
import { z } from 'zod';
import { workingModel as config } from '../config';
import { logger } from '../lib/logger';

const stateKey = 'working-model';

function slugOf(modelId: string): string {
  return modelId.startsWith('openrouter/')
    ? modelId.slice('openrouter/'.length)
    : modelId;
}

export async function recallModel(): Promise<string | undefined> {
  try {
    return (
      z
        .string()
        .nullish()
        .parse(await Chat.getSingleton().getState().get(stateKey)) ?? undefined
    );
  } catch (err) {
    logger.warn('[working-model] failed to read', { err });
  }
}

async function pinModelOnce({
  modelId,
  modelProvider,
}: {
  modelId: string;
  modelProvider?: string;
}): Promise<void> {
  const slug =
    modelProvider && !modelId.startsWith(`${modelProvider}/`)
      ? slugOf(`${modelProvider}/${modelId}`)
      : slugOf(modelId);
  try {
    await Chat.getSingleton()
      .getState()
      .setIfNotExists(stateKey, slug, config.ttl);
  } catch (err) {
    logger.warn('[working-model] failed to persist', { err, slug });
  }
}

const responseSchema = z.object({
  modelMetadata: z.object({ modelProvider: z.string() }).optional(),
});

export function workingModel(agentKey: string) {
  return {
    id: `working-model-${agentKey}`,
    name: 'Working Model',
    description:
      'Remembers the model that just answered so the next run tries it first.',
    async processOutputResult(args) {
      if (args.result.finishReason === 'error') {
        return args.messages;
      }
      const response = args.result.steps.at(-1)?.response;
      const modelId = response?.modelId;
      if (modelId) {
        await pinModelOnce({
          modelId,
          modelProvider:
            responseSchema.safeParse(response).data?.modelMetadata
              ?.modelProvider,
        });
      }
      return args.messages;
    },
  } satisfies Processor;
}
