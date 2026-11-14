import { formatSlackUser } from '@chat-adapter/slack/format';
import { add, type Duration } from 'date-fns';
import { z } from 'zod';
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
import { moderationIds } from './ids';
import { isModerator } from './moderators';

const cardKey = (banId: string) => `moderation:card:${banId}`;
const cardRef = z.object({ messageId: z.string(), threadId: z.string() });

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
  const previous = await activeBan(userId);
  const event = await recordDecision({
    action,
    actorId,
    userId,
    reason,
    expiresAt:
      action === 'ban' && duration ? add(new Date(), duration) : undefined,
  });
  logger.info(`[moderation] ${action}`, { actorId, duration, userId });
  publishHome(userId).catch((error: unknown) =>
    logger.warn('[moderation] could not refresh App Home', { error, userId })
  );
  if (!env.LOGS_CHANNEL) {
    logger.warn('[moderation] LOGS_CHANNEL is not set, card not posted');
    return event;
  }
  const state = chat().getState();
  try {
    const sent = await chat()
      .channel(chatChannelId(env.LOGS_CHANNEL))
      .post(decisionCard({ event }));
    if (event.action === 'ban') {
      await state.set(cardKey(event.id), {
        messageId: sent.id,
        threadId: sent.threadId,
      });
    }
  } catch (error) {
    logger.error('[moderation] could not post to the logs channel', { error });
  }
  // The old ban's card would otherwise keep a live Unban button.
  const card = previous
    ? cardRef.safeParse(await state.get(cardKey(previous.id)))
    : undefined;
  if (previous && card?.success) {
    await slack
      .editMessage(
        card.data.threadId,
        card.data.messageId,
        decisionCard({
          closed:
            action === 'unban'
              ? `Lifted by ${formatSlackUser(actorId)}.`
              : 'Replaced by a newer ban.',
          event: previous,
        })
      )
      .catch((error: unknown) =>
        logger.warn('[moderation] could not update the ban card', { error })
      );
    await state.delete(cardKey(previous.id));
  }
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
    // Only the newest ban is in force, so lifting an older card's ban would
    // lift the newer one instead.
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
    // decide closes cards it posted; this also covers cards from before it
    // kept their message ids.
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

  bot.onAction(moderationIds.info, async (event) => {
    // Raw, because Chat SDK's Slack adapter always adds a Submit button and
    // this modal only explains.
    await slack.webClient.views
      .open({
        trigger_id: event.triggerId ?? '',
        view: {
          type: 'modal',
          title: { type: 'plain_text', text: 'Gorkie bans' },
          close: { type: 'plain_text', text: 'Close' },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: "Moderators can ban people from Gorkie when they break Gorkie's terms or the community guidelines. A banned person cannot use Gorkie anywhere, and their scheduled tasks are skipped until the ban ends.\n\nBans can be temporary or permanent. If a ban looks like a mistake, talk to a moderator directly.",
              },
            },
          ],
        },
      })
      .catch((error: unknown) =>
        logger.warn('[moderation] could not open the info modal', { error })
      );
  });
}
