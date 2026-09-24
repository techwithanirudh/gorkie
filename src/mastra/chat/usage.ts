import { formatDistanceToNowStrict } from 'date-fns';
import { recordTurn, turnUsage } from '../db/queries/usage';
import { logger } from '../lib/logger';
import type { TurnUsage } from '../types';
import { isModerator } from './moderation/moderators';

export async function usageFor(
  userId: string
): Promise<TurnUsage | 'unlimited'> {
  return isModerator(userId) ? 'unlimited' : await turnUsage(userId);
}

// Returns the notice to show when the person is over a limit, otherwise counts
// the turn against them.
export async function claimTurn(userId: string): Promise<string | undefined> {
  if (isModerator(userId)) {
    return;
  }
  try {
    const { day, hour } = await turnUsage(userId);
    // Day first: when both are spent, the day's reset is the one that matters.
    const spent = [
      { window: day, span: 'today' },
      { window: hour, span: 'this hour' },
    ].find(({ window }) => window.remaining === 0);
    if (spent) {
      const wait = spent.window.resetsAt
        ? ` try again in ${formatDistanceToNowStrict(spent.window.resetsAt)}.`
        : '';
      return `you've used all ${spent.window.limit} of your gorkie turns ${spent.span}.${wait} your home tab shows what's left.`;
    }
    await recordTurn(userId);
  } catch (error) {
    // Fail open, like the ban check: a database hiccup must not stop everyone.
    logger.error('[usage] turn limit check failed', { error, userId });
  }
}
