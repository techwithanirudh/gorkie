import type { RequestContext } from '@mastra/core/request-context';
import type { ChannelContext, GorkieRequestContext } from '../types';

export function channelContext(requestContext?: RequestContext): ChannelContext {
  return (requestContext as GorkieRequestContext | undefined)?.get('channel') ?? {};
}
