import type { SlackBlock } from '@chat-adapter/slack/blocks';

export interface HomeSection {
  fixed: SlackBlock[];
  overflow?: (dropped: number) => SlackBlock;
  rows?: SlackBlock[][];
  trailing?: SlackBlock[];
}
