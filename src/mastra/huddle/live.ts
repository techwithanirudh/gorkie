import type { LiveHuddle } from '../types';

export const liveHuddles = new Map<string, LiveHuddle>();

export function huddleInThread(threadId?: string) {
  return [...liveHuddles.values()].find(
    (live) => live.slackThreadId === threadId
  );
}
