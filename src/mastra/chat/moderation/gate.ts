import type { Author } from 'chat';
import { env } from '@/env';
import { activeBan } from '../../db/queries/moderation';
import { logger } from '../../lib/logger';
import type { BanStatus } from '../../types';

export function isModerator(userId: string): boolean {
  return env.MODERATORS.includes(userId);
}

export async function banStatus(userId: string): Promise<BanStatus> {
  try {
    const ban = await activeBan(userId);
    return ban ? { status: 'banned', ban } : { status: 'clear' };
  } catch (error) {
    logger.error('[moderation] ban lookup failed', { error, userId });
    return { status: 'lookup-failed' };
  }
}

export function guarded<Event extends { user: Author }, Result>(
  handler: (event: Event) => Promise<Result> | Result
) {
  return async (event: Event): Promise<Result | undefined> => {
    if ((await banStatus(event.user.userId)).status !== 'clear') {
      logger.info('[moderation] ignored a banned user', {
        userId: event.user.userId,
      });
      return;
    }
    return await handler(event);
  };
}
