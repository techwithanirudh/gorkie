import type { ChannelContext as MastraChannelContext } from '@mastra/core/channels';

export type ChannelContext = Partial<MastraChannelContext>;

export interface MemberLeftEvent {
  channel: string;
  userId: string;
}

export interface SlackId {
  channel: string | undefined;
  ts: string | undefined;
}
