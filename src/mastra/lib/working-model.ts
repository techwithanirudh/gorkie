import { Chat } from 'chat';
import { workingModel } from '../config';
import { logger } from './logger';

const SHARED_WORKING_MODEL_KEY = 'working-model';

export function slugOf(modelId: string): string {
  return modelId.startsWith('openrouter/')
    ? modelId.slice('openrouter/'.length)
    : modelId;
}

export async function recallModel(): Promise<string | undefined> {
  try {
    return (
      (await Chat.getSingleton()
        .getState()
        .get<string>(SHARED_WORKING_MODEL_KEY)) ?? undefined
    );
  } catch (err) {
    logger.warn('[working-model] failed to read', { err });
  }
}

export async function rememberModel({
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
  // Never renewed: refreshing on every answer kept a fallback pinned for as long
  // as it kept answering, so the recovered primary was never tried again. The
  // pin now lapses on schedule and the next turn re-probes the ladder in order.
  try {
    await Chat.getSingleton()
      .getState()
      .setIfNotExists(SHARED_WORKING_MODEL_KEY, slug, workingModel.ttl);
  } catch (err) {
    logger.warn('[working-model] failed to persist', { err, slug });
  }
}
