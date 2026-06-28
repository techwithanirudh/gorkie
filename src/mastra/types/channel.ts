import type { RequestContext } from '@mastra/core/request-context';

export interface ChannelContext {
  channelId?: string;
  isDM?: boolean;
  platform?: string;
  threadId?: string;
  userId?: string;
  userName?: string;
}

export type GorkieRequestContext = RequestContext<{ channel?: ChannelContext }>;
