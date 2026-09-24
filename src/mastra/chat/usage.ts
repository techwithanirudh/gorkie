import { formatDistanceToNowStrict } from 'date-fns';
import { recordTurnWithinLimit } from '../db/queries/usage';
import { logger } from '../lib/logger';
import { isModerator } from './moderation/moderators';

// 'unchecked' means the usage lookup failed and the turn went ahead unrecorded.
type TurnClaim =
  | { status: 'claimed' | 'unchecked' }
  | { status: 'over-limit'; notice: string };

export async function claimTurn(userId: string): Promise<TurnClaim> {
  if (isModerator(userId)) {
    return { status: 'claimed' };
  }
  try {
    const { recorded, usage } = await recordTurnWithinLimit(userId);
    if (recorded) {
      return { status: 'claimed' };
    }
    const spent =
      usage.day.remaining === 0
        ? { window: usage.day, span: 'today' }
        : { window: usage.hour, span: 'this hour' };
    const wait = spent.window.resetsAt
      ? ` try again in ${formatDistanceToNowStrict(spent.window.resetsAt)}.`
      : '';
    return {
      status: 'over-limit',
      notice: `you've used all ${spent.window.limit} of your gorkie turns ${spent.span}.${wait} your home tab shows what's left.`,
    };
  } catch (error) {
    logger.error('[usage] turn limit check failed', { error, userId });
    return { status: 'unchecked' };
  }
}
