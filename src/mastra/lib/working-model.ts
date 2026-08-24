import { chat } from '../chat/instance';
import { workingModel } from '../config';
import { logger } from './logger';

function cacheKey(agentKey: string): string {
  return `working-model:${agentKey}`;
}

export function slugOf(modelId: string): string {
  return modelId.startsWith('openrouter/')
    ? modelId.slice('openrouter/'.length)
    : modelId;
}

// OpenCode answers a bare `mimo-v2.5` for `opencode-go/mimo-v2.5`, so put the
// provider back before anything compares this against the configured list.
export function qualifiedSlug({
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

export function sameModel(entrySlug: string, recalled: string): boolean {
  return (
    entrySlug === recalled ||
    entrySlug.endsWith(`/${recalled}`) ||
    recalled.endsWith(`/${entrySlug}`)
  );
}

export async function recallModel(
  agentKey: string
): Promise<string | undefined> {
  try {
    return (
      (await chat().getState().get<string>(cacheKey(agentKey))) ?? undefined
    );
  } catch (err) {
    logger.warn('[working-model] failed to read', { agentKey, err });
  }
}

export async function rememberModel({
  agentKey,
  modelId,
  modelProvider,
}: {
  agentKey: string;
  modelId: string;
  modelProvider?: string;
}): Promise<void> {
  const slug = qualifiedSlug({ modelId, modelProvider });
  try {
    await chat().getState().set(cacheKey(agentKey), slug, workingModel.ttl);
  } catch (err) {
    logger.warn('[working-model] failed to persist', { agentKey, err, slug });
  }
}
