import { formatDistanceToNowStrict } from 'date-fns';
import { recordTurn, turnUsage } from '../db/queries/usage';
import { logger } from '../lib/logger';
import { isModerator } from './moderation/moderators';

export async function claimTurn(userId: string): Promise<string | undefined> {
  if (isModerator(userId)) {
    return;
  }
  try {
    const { day, hour } = await turnUsage(userId);
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
    logger.error('[usage] turn limit check failed', { error, userId });
  }
}
