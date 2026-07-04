import type { Thread } from 'chat';
import type { ThreadState } from '../types';

/**
 * Mastra's ChannelHandler fixes the Chat SDK's Thread generic at its default
 * (Record<string, unknown>), so thread state cannot be typed at the source.
 * This is the one place that cast lives.
 */
export async function threadState(
  thread: Thread | undefined
): Promise<ThreadState | null> {
  return ((await thread?.state) ?? null) as ThreadState | null;
}
