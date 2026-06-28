import type { RequestContext } from '@mastra/core/request-context';

export interface ChannelContext {
  platform?: string;
  isDM?: boolean;
  threadId?: string;
  channelId?: string;
  userId?: string;
  userName?: string;
}

export type GorkieRequestContext = RequestContext<{ channel?: ChannelContext }>;
