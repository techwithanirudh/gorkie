import type { RequestContext } from '@mastra/core/request-context';

export interface ChannelContext {
  platform?: string;
  isDM?: boolean;
  threadId?: string;
  channelId?: string;
  userId?: string;
  userName?: string;
}

export interface GorkieThreadState {
  respondOnThreadMessages?: boolean;
}

type GorkieRequestContext = RequestContext<{ channel?: ChannelContext }>;

export function channelContext(requestContext?: RequestContext): ChannelContext {
  return (
    (requestContext as GorkieRequestContext | undefined)?.get('channel') ?? {}
  );
}
