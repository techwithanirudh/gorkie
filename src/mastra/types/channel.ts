import type { ChannelContext as MastraChannelContext } from '@mastra/core/channels';
import type { RequestContext } from '@mastra/core/request-context';

export type ChannelContext = Partial<MastraChannelContext>;

export type GorkieRequestContext = RequestContext<{ channel?: ChannelContext }>;
