import { CardText, Modal } from 'chat';
import { add, type Duration } from 'date-fns';
import { env } from '@/env';
import {
  activeBan,
  getModerationEvent,
  recordDecision,
} from '../../db/queries/moderation';
import { chatChannelId } from '../../lib/ids';
import { logger } from '../../lib/logger';
import type { BanDuration, ModerationEvent } from '../../types';
import { publishHome } from '../app-home/view';
import { slack } from '../client';
import { chat } from '../instance';
import { notify } from '../notify';
import { decisionCard } from './cards';
import { moderationIds } from './ids';
import { isModerator } from './moderators';

const banDurations: Record<Exclude<BanDuration, 'perm'>, Duration> = {
  '1h': { hours: 1 },
  '1d': { days: 1 },
  '7d': { days: 7 },
  '30d': { days: 30 },
};

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
  duration?: BanDuration;
  reason?: string;
}): Promise<ModerationEvent> {
  const event = await recordDecision({
    action,
    actorId,
    userId,
    reason,
    expiresAt:
      action === 'ban' && duration && duration !== 'perm'
        ? add(new Date(), banDurations[duration])
        : undefined,
  });
  logger.info(`[moderation] ${action}`, { actorId, duration, userId });
  if (env.LOGS_CHANNEL) {
    await chat()
      .channel(chatChannelId(env.LOGS_CHANNEL))
      .post(decisionCard({ event }))
      .catch((error: unknown) =>
        logger.error('[moderation] could not post to the logs channel', {
          error,
        })
      );
  } else {
    logger.warn('[moderation] LOGS_CHANNEL is not set, card not posted');
  }
  publishHome(userId).catch((error: unknown) =>
    logger.warn('[moderation] could not refresh App Home', { error, userId })
  );
  return event;
}

export function registerModeration(): void {
  const bot = chat();

  bot.onAction(moderationIds.unban, async (event) => {
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
    if (await activeBan(ban.userId)) {
      await decide({
        action: 'unban',
        actorId: event.user.userId,
        userId: ban.userId,
      });
    }
    await slack
      .editMessage(
        event.threadId,
        event.messageId,
        decisionCard({ event: ban, liftedBy: event.user.userId })
      )
      .catch((error: unknown) =>
        logger.warn('[moderation] could not update the ban card', { error })
      );
  });

  bot.onAction(moderationIds.info, async (event) => {
    await event
      .openModal(
        Modal({
          callbackId: moderationIds.infoModal,
          title: 'Gorkie bans',
          children: [
            CardText(
              "Moderators can ban people from Gorkie when they break Gorkie's terms or the community guidelines. A banned person cannot use Gorkie anywhere, and their scheduled tasks are skipped until the ban ends.\n\nBans can be temporary or permanent. If a ban looks like a mistake, talk to a moderator directly."
            ),
          ],
        })
      )
      .catch((error: unknown) =>
        logger.warn('[moderation] could not open the info modal', { error })
      );
  });
}
