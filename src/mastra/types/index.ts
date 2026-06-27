/** Channel context channels writes to `requestContext.get('channel')`. */
export interface ChannelContext {
  platform?: string;
  isDM?: boolean;
  threadId?: string;
  channelId?: string;
  userId?: string;
  userName?: string;
}

/** Per-thread state persisted via Chat SDK's thread state store. */
export interface GorkieThreadState {
  /** Set once gorkie is pinged at a thread's start, meaning it follows the whole thread. */
  respondOnThreadMessages?: boolean;
}
