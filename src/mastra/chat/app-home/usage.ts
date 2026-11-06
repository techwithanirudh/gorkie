import { usageLine } from '../../lib/limits';
import { heading, note } from './blocks';
import type { HomeSection } from './limit';

export function usageBlocks(
  usage: { max: number; noun: string; used: number }[]
): HomeSection {
  return {
    fixed: [
      heading('Usage This Hour'),
      {
        type: 'section',
        text: { type: 'mrkdwn', text: usage.map(usageLine).join('\n') },
      },
      note('Resets at the top of each hour, and whenever Gorkie restarts.'),
    ],
  };
}
