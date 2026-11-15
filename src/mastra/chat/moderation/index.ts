import { formatSlackUser } from '@chat-adapter/slack/format';
import { add, type Duration } from 'date-fns';
import { env } from '@/env';
import {
  activeBan,
  getModerationEvent,
  recordDecision,
} from '../../db/queries/moderation';
import { chatChannelId } from '../../lib/ids';
import { logger } from '../../lib/logger';
import type { ModerationEvent } from '../../types';
import { publishHome } from '../app-home/view';
import { slack } from '../client';
import { chat } from '../instance';
import { notify } from '../notify';
import { decisionCard } from './cards';
import { isModerator } from './gate';
import { moderationIds } from './ids';

export async function decide({
  action,
  actorId,
  userId,
  duration,
  reason,
}: {
  action: ModerationEvent['action'];
  actorId: string;
  userId: string;
  duration?: Duration;
  reason?: string;
}): Promise<ModerationEvent> {
  const now = new Date();
  const event = await recordDecision({
    action,
    actorId,
    userId,
    reason,
    createdAt: now,
    expiresAt: action === 'ban' && duration ? add(now, duration) : undefined,
  });
  logger.info(`[moderation] ${action}`, { actorId, duration, userId });
  publishHome(userId).catch((error: unknown) =>
    logger.warn('[moderation] could not refresh App Home', { error, userId })
  );
  if (!env.LOGS_CHANNEL) {
    logger.warn('[moderation] LOGS_CHANNEL is not set, card not posted');
    return event;
  }
  await chat()
    .channel(chatChannelId(env.LOGS_CHANNEL))
    .post(decisionCard({ event }))
    .catch((error: unknown) =>
      logger.error('[moderation] could not post to the logs channel', {
        error,
      })
    );
  return event;
}

export function registerModeration(): void {
  // An older card keeps its Unban button, so a click checks the live ban
  // first and only lifts the ban that card is about.
  chat().onAction(moderationIds.unban, async (event) => {
    if (!isModerator(event.user.userId)) {
      await notify({
        text: 'Only Gorkie moderators can do that.',
        thread: event.thread,
        user: event.user,
      });
      return;
    }
    const ban = event.value ? await getModerationEvent(event.value) : undefined;
    if (!ban) {
      return;
    }
    const active = await activeBan(ban.userId);
    let closed = 'Already lifted or expired.';
    if (active?.id === ban.id) {
      await decide({
        action: 'unban',
        actorId: event.user.userId,
        userId: ban.userId,
      });
      closed = `Lifted by ${formatSlackUser(event.user.userId)}.`;
    } else if (active) {
      closed =
        'Replaced by a newer ban, so nothing was lifted. Use the newest card.';
    }
    await slack
      .editMessage(
        event.threadId,
        event.messageId,
        decisionCard({ closed, event: ban })
      )
      .catch((error: unknown) =>
        logger.warn('[moderation] could not update the ban card', { error })
      );
  });
}
