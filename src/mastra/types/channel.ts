import type { ChannelContext as MastraChannelContext } from '@mastra/core/channels';

export type ChannelContext = Partial<MastraChannelContext>;

// Rebuilt from the thread id alone, as after a restart: there is no sender to
// recover, so user-scoped tools stay off for the turn it starts.
export interface ThreadOnlyChannelContext {
  channelId: string;
  isDM: boolean;
  platform: 'slack';
  threadId: string;
  userId?: never;
}

export interface MemberLeftEvent {
  channel: string;
  userId: string;
}

export interface SlackId {
  channel: string | undefined;
  ts: string | undefined;
}
