import { Actions, Button, Card, CardText, Field, Fields, Modal } from 'chat';
import { format } from 'date-fns';
import type { ModerationEvent } from '../../types';
import { moderationIds } from './ids';

function until(expiresAt: Date | null): string {
  return expiresAt
    ? format(expiresAt, "MMM d, yyyy 'at' HH:mm 'UTC'")
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

export function infoModal() {
  return Modal({
    callbackId: moderationIds.infoModal,
    title: 'gorkie bans',
    children: [
      CardText(
        "Moderators can ban people from gorkie when they break gorkie's terms or the community guidelines. A banned person cannot use gorkie anywhere, and their scheduled tasks are skipped until the ban ends.\n\nBans can be temporary or permanent. If a ban looks like a mistake, talk to a moderator directly."
      ),
    ],
  });
}

export function banNotice(expiresAt: Date | null): string {
  return `you're banned from gorkie${expiresAt ? ` until ${until(expiresAt)}` : ''}. talk to a moderator if you think this is a mistake.`;
}
