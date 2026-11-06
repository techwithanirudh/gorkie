import { heading, note } from './blocks';
import type { HomeSection } from './limit';

export function usageBlocks(
  usage: { max: number; noun: string; used: number }[]
): HomeSection {
  const lines = usage.map(
    ({ max, noun, used }) =>
      `${noun.charAt(0).toUpperCase()}${noun.slice(1)}: ${used} of ${max}`
  );
  return {
    fixed: [
      heading('Usage This Hour'),
      note(lines.join('  ·  ')),
      note('Resets at the top of each hour, and whenever Gorkie restarts.'),
    ],
  };
}
