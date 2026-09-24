import { toolDisplay as config } from '../config';
import { getToolDisplay } from '../db/queries/settings';
import type { ToolDisplayMode, ToolDisplaySource } from '../types';
import { threadState } from './state';

export async function resolveToolDisplay({
  threadId,
  userId,
}: {
  threadId?: string;
  userId?: string;
}): Promise<{ mode: ToolDisplayMode; source: ToolDisplaySource }> {
  const [thread, personal] = await Promise.all([
    threadId ? threadState({ id: threadId }) : undefined,
    userId ? getToolDisplay(userId) : undefined,
  ]);
  if (thread?.toolDisplay) {
    return { mode: thread.toolDisplay, source: 'thread' };
  }
  if (personal) {
    return { mode: personal, source: 'you' };
  }
  return { mode: config.default, source: 'default' };
}
