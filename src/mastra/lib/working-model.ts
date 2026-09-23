import { chat } from '../chat/instance';
import { workingModel } from '../config';
import { logger } from './logger';

const SHARED_WORKING_MODEL_KEY = 'working-model';

export function slugOf(modelId: string): string {
  return modelId.startsWith('openrouter/')
    ? modelId.slice('openrouter/'.length)
    : modelId;
}

function qualifiedSlug({
  modelId,
  modelProvider,
}: {
  modelId: string;
  modelProvider?: string;
}): string {
  return modelProvider && !modelId.startsWith(`${modelProvider}/`)
    ? slugOf(`${modelProvider}/${modelId}`)
    : slugOf(modelId);
}

export async function recallModel(): Promise<string | undefined> {
  try {
    return (
      (await chat().getState().get<string>(SHARED_WORKING_MODEL_KEY)) ??
      undefined
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
  const slug = qualifiedSlug({ modelId, modelProvider });
  try {
    await chat()
      .getState()
      .set(SHARED_WORKING_MODEL_KEY, slug, workingModel.ttl);
  } catch (err) {
    logger.warn('[working-model] failed to persist', { err, slug });
  }
}
