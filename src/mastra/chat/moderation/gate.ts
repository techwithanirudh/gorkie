import type { Author } from 'chat';
import { activeBan } from '../../db/queries/moderation';
import { logger } from '../../lib/logger';
import type { BanStatus } from '../../types';

export async function banStatus(userId: string): Promise<BanStatus> {
  try {
    const ban = await activeBan(userId);
    return ban ? { status: 'banned', ban } : { status: 'clear' };
  } catch (error) {
    logger.error('[moderation] ban lookup failed', { error, userId });
    return { status: 'lookup-failed' };
  }
}

// Fails closed: a ban that cannot be checked is treated as a ban.
export async function isBanned(userId: string): Promise<boolean> {
  return (await banStatus(userId)).status !== 'clear';
}

export function guarded<Event extends { user: Author }, Result>(
  handler: (event: Event) => Promise<Result> | Result
) {
  return async (event: Event): Promise<Result | undefined> => {
    if (await isBanned(event.user.userId)) {
      logger.info('[moderation] ignored a banned user', {
        userId: event.user.userId,
      });
      return;
    }
    return await handler(event);
  };
}
