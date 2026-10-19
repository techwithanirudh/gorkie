import { formatDistanceToNowStrict } from 'date-fns';
import type { HomeSection, TurnUsage, UsageWindow } from '../../types';

function line({ label, window }: { label: string; window: UsageWindow }) {
  const reset =
    window.remaining < window.limit && window.resetsAt
      ? `, next one frees up in ${formatDistanceToNowStrict(window.resetsAt)}`
      : '';
  return `*${label}:* ${window.remaining} of ${window.limit} left${reset}`;
}

export function usageBlocks(usage: TurnUsage | 'unlimited'): HomeSection {
  const text =
    usage === 'unlimited'
      ? 'moderators have no turn limit.'
      : [
          line({ label: 'this hour', window: usage.hour }),
          line({ label: 'today', window: usage.day }),
        ].join('\n');
  return {
    fixed: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Usage*\neach message gorkie answers is one turn. limits roll: a turn counts for an hour and for a day after you send it.\n${text}`,
        },
      },
    ],
    trailing: [{ type: 'divider' }],
  };
}
