import type { SlackBlock } from '@chat-adapter/slack/blocks';
import type { HomeSection } from '../../types';

export function fitHome(sections: HomeSection[]): SlackBlock[] {
  const reserved = sections.filter((section) => section.rows?.length).length;
  // Slack rejects a Home view with more than 100 blocks.
  let budget =
    100 -
    sections.reduce(
      (total, section) =>
        total + section.fixed.length + (section.trailing?.length ?? 0),
      0
    ) -
    reserved;

  return sections.flatMap((section) => {
    const rows = section.rows ?? [];
    let taken = 0;
    while (taken < rows.length && rows[taken].length <= budget) {
      budget -= rows[taken].length;
      taken++;
    }
    const dropped = rows.length - taken;
    return [
      ...section.fixed,
      ...rows.slice(0, taken).flat(),
      ...(dropped > 0 && section.overflow ? [section.overflow(dropped)] : []),
      ...(section.trailing ?? []),
    ];
  });
}
