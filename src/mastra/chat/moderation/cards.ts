import { formatSlackDate, formatSlackUser } from '@chat-adapter/slack/format';
import { Actions, Button, Card, CardText, Field, Fields } from 'chat';
import { formatDuration, intervalToDuration } from 'date-fns';
import type { BanStatus, ModerationEvent } from '../../types';
import { moderationIds } from './ids';

// Slack renders the date token in each reader's own timezone.
export function until(expiresAt: Date | null): string {
  return expiresAt
    ? formatSlackDate(
        expiresAt,
        '{date_short_pretty} at {time}',
        expiresAt.toUTCString()
      )
    : 'permanent';
}

export function decisionCard({
  closed,
  event,
}: {
  closed?: string;
  event: ModerationEvent;
}) {
  const banned = event.action === 'ban';
  return Card({
    title: banned ? 'Banned' : 'Unbanned',
    children: [
      Fields([
        Field({ label: 'User', value: formatSlackUser(event.userId) }),
        Field({ label: 'By', value: formatSlackUser(event.actorId) }),
        ...(banned
          ? [
              Field({
                label: 'Duration',
                value: event.expiresAt
                  ? `${
                      formatDuration(
                        intervalToDuration({
                          start: event.createdAt,
                          end: event.expiresAt,
                        })
                      ) || 'under a minute'
                    }, until ${until(event.expiresAt)}`
                  : 'Permanent',
              }),
            ]
          : []),
      ]),
      CardText(`*Reason:* ${event.reason ?? 'none given'}`),
      ...(closed ? [CardText(`_${closed}_`)] : []),
      ...(banned && !closed
        ? [
            Actions([
              Button({
                id: moderationIds.unban,
                label: 'Unban',
                value: event.id,
              }),
            ]),
          ]
        : []),
    ],
  });
}

export function banNotice(expiresAt: Date | null): string {
  return `You're banned from Gorkie${expiresAt ? ` until ${until(expiresAt)}` : ''}. Talk to a moderator if you think this is a mistake.`;
}

export function banRefusal(result: BanStatus): string {
  return result.status === 'banned'
    ? banNotice(result.ban.expiresAt)
    : "I couldn't check whether you're banned just now. Try again in a minute.";
}
