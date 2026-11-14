import { limitWindowHours } from '../../config';
import { usageLine } from '../../lib/limits';
import { heading, note } from './blocks';
import type { HomeSection } from './limit';

export function usageBlocks(
  usage: Parameters<typeof usageLine>[0][]
): HomeSection {
  return {
    fixed: [
      heading('Usage Limits'),
      {
        type: 'section',
        text: { type: 'mrkdwn', text: usage.map(usageLine).join('\n') },
      },
      note(
        `Each limit starts at its first use and resets ${limitWindowHours} hours later.`
      ),
    ],
    trailing: [{ type: 'divider' }],
  };
}
