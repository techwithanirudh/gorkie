import { z } from 'zod';

export const channelSchema = z.looseObject({
  botUserId: z.string().optional(),
  channelId: z.string().optional(),
  eventType: z.string().optional(),
  isDM: z.boolean().optional(),
  messageId: z.string().optional(),
  threadId: z.string().optional(),
  userId: z.string().optional(),
  userName: z.string().optional(),
});

export type ChannelContext = z.infer<typeof channelSchema>;

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
