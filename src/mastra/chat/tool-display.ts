import { toolDisplay as config } from '../config';
import { getUserSettings } from '../db/queries/settings';
import type { ToolDisplayMode, ToolDisplaySource } from '../types';
import { threadStateOrNull } from './state';

export async function resolveToolDisplay({
  threadId,
  userId,
}: {
  threadId?: string;
  userId?: string;
}): Promise<{ mode: ToolDisplayMode; source: ToolDisplaySource }> {
  const [thread, personal] = await Promise.all([
    threadId ? threadStateOrNull({ id: threadId }) : undefined,
    userId ? getUserSettings(userId) : undefined,
  ]);
  if (thread?.toolDisplay) {
    return { mode: thread.toolDisplay, source: 'thread' };
  }
  if (personal?.toolDisplay) {
    return { mode: personal.toolDisplay, source: 'you' };
  }
  return { mode: config.default, source: 'default' };
}
