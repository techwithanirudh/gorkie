import { Actions, Button, Card, CardText, Field, Fields } from 'chat';
import { neutralizeBroadcasts } from './message';

function readable(name: string): string {
  const words = name
    .replace(/[_-]+/g, ' ')
    .replace(/\bgithub\b/gi, 'GitHub')
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function shown(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const clipped = text.length > 300 ? `${text.slice(0, 300)}…` : text;
  return neutralizeBroadcasts(clipped);
}

// The button ids are the ones Mastra's approval handler listens for, so only
// the card around them changes.
export function approvalCard({
  args,
  displayName,
  toolCallId,
}: {
  args: unknown;
  displayName: string;
  toolCallId: string;
}) {
  const entries =
    typeof args === 'object' && args !== null
      ? Object.entries(args).filter(
          ([, value]) => value !== undefined && value !== null && value !== ''
        )
      : [];
  return Card({
    title: `Approve: ${readable(displayName)}`,
    children: [
      CardText('gorkie wants to run this. Nothing happens until you approve.'),
      ...(entries.length > 0
        ? [
            Fields(
              entries
                .slice(0, 10)
                .map(([key, value]) =>
                  Field({ label: readable(key), value: shown(value) })
                )
            ),
          ]
        : []),
      Actions([
        Button({
          id: `tool_approve:${toolCallId}`,
          label: 'Approve',
          style: 'primary',
        }),
        Button({
          id: `tool_deny:${toolCallId}`,
          label: 'Deny',
          style: 'danger',
        }),
      ]),
    ],
  });
}
