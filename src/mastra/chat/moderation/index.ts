import { CardText, Chat, Modal } from 'chat';
import { add, type Duration } from 'date-fns';
import { env } from '@/env';
import {
  activeBan,
  getModerationEvent,
  recordDecision,
} from '../../db/queries/moderation';
import { chatChannelId, rawId } from '../../lib/ids';
import { logger } from '../../lib/logger';
import type { BanDuration, ModerationEvent } from '../../types';
import { publishHome } from '../app-home/view';
import { slack } from '../client';
import { notify } from '../notify';
import { decisionCard } from './cards';
import { moderationIds } from './ids';
import { isModerator } from './moderators';

const DURATION: Record<Exclude<BanDuration, 'perm'>, Duration> = {
  '1h': { hours: 1 },
  '1d': { days: 1 },
  '7d': { days: 7 },
  '30d': { days: 30 },
};

export async function isBanned(userId: string) {
  try {
    return await activeBan(userId);
  } catch (error) {
    logger.error('[moderation] ban lookup failed', { error, userId });
  }
}

export function banGuard({
  actorId,
  userId,
}: {
  actorId: string;
  userId: string;
}): string | undefined {
  if (!isModerator(actorId)) {
    return 'only gorkie moderators can do that.';
  }
  if (rawId(userId) === rawId(actorId)) {
    return "you can't ban yourself.";
  }
  if (isModerator(userId)) {
    return "moderators can't be banned. remove them from MODERATORS first.";
  }
  if (slack.botUserId && rawId(userId) === slack.botUserId) {
    return "gorkie can't ban itself.";
  }
}

export async function decide({
  action,
  actorId,
  userId,
  duration = 'perm',
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
      action === 'ban' && duration !== 'perm'
        ? add(new Date(), DURATION[duration])
        : undefined,
  });
  logger.info(`[moderation] ${action}`, { actorId, duration, userId });
  if (env.LOGS_CHANNEL) {
    await Chat.getSingleton()
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
  publishHome(rawId(userId)).catch((error: unknown) =>
    logger.warn('[moderation] could not refresh the Home tab', {
      error,
      userId,
    })
  );
  return event;
}

export function registerModeration(): void {
  const bot = Chat.getSingleton();

  bot.onAction(moderationIds.unban, async (event) => {
    if (!isModerator(event.user.userId)) {
      await notify({
        text: 'only gorkie moderators can do that.',
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
        decisionCard({ event: ban, liftedBy: rawId(event.user.userId) })
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
          title: 'gorkie bans',
          children: [
            CardText(
              "Moderators can ban people from gorkie when they break gorkie's terms or the community guidelines. A banned person cannot use gorkie anywhere, and their scheduled tasks are skipped until the ban ends.\n\nBans can be temporary or permanent. If a ban looks like a mistake, talk to a moderator directly."
            ),
          ],
        })
      )
      .catch((error: unknown) =>
        logger.warn('[moderation] could not open the info modal', { error })
      );
  });
}
