import { env } from '@/env';
import { getUserBan } from '../db/queries/bans';
import { rawId } from './ids';
import { logger } from './logger';

function adminIds(): Set<string> {
  return new Set(
    env.ADMIN_USER_IDS?.split(',')
      .map((id) => rawId(id.trim()))
      .filter(Boolean) ?? []
  );
}

export function isAdmin(userId: string): boolean {
  return adminIds().has(rawId(userId));
}

export function parseSlackUserId(
  value: string | undefined
): string | undefined {
  const id = value?.match(/^<?@?([UW][A-Z0-9]+)(?:\|[^>]+)?>?$/i)?.[1];
  return id?.toUpperCase();
}

export async function isUserBanned(userId: string): Promise<boolean> {
  try {
    return (await getUserBan(userId)) !== undefined;
  } catch (error) {
    logger.error('[bans] failed to read ban status', { error, userId });
    return true;
  }
}
