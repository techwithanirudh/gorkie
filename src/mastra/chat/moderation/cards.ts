import { Actions, Button, Card, CardText, Field, Fields } from 'chat';
import type { ModerationEvent } from '../../types';
import { moderationIds } from './ids';

// Slack renders the date token in each reader's own timezone.
export function until(expiresAt: Date | null): string {
  return expiresAt
    ? `<!date^${Math.floor(expiresAt.getTime() / 1000)}^{date_short_pretty} at {time}|${expiresAt.toUTCString()}>`
    : 'permanent';
}

export function decisionCard({
  event,
  liftedBy,
}: {
  event: ModerationEvent;
  liftedBy?: string;
}) {
  const banned = event.action === 'ban';
  return Card({
    title: banned ? ':hammer: banned' : ':white_check_mark: unbanned',
    children: [
      Fields([
        Field({ label: 'User', value: `<@${event.userId}>` }),
        Field({ label: 'By', value: `<@${event.actorId}>` }),
        ...(banned
          ? [Field({ label: 'Until', value: until(event.expiresAt) })]
          : []),
      ]),
      CardText(`*Reason:* ${event.reason ?? 'none given'}`),
      ...(liftedBy ? [CardText(`_Lifted by <@${liftedBy}>._`)] : []),
      Actions([
        ...(banned && !liftedBy
          ? [
              Button({
                id: moderationIds.unban,
                label: 'Unban',
                value: event.id,
              }),
            ]
          : []),
        Button({ id: moderationIds.info, label: 'More info' }),
      ]),
    ],
  });
}

export function banNotice(expiresAt: Date | null): string {
  return `you're banned from gorkie${expiresAt ? ` until ${until(expiresAt)}` : ''}. talk to a moderator if you think this is a mistake.`;
}
