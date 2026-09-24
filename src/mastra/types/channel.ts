import type { ChannelContext as MastraChannelContext } from '@mastra/core/channels';

// TODO(slopradar): CODING_STANDARDS: one canonical shape | this type and lib/context.ts channelSchema describe the same parsed value twice (Partial of Mastra's 12 fields vs the schema's 8), so callers are typed for fields (platform, botMention, botUserName) the parser never keeps | move channelSchema here and `export type ChannelContext = z.infer<typeof channelSchema>` (lib/context.ts annotation proposes the same move)
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
