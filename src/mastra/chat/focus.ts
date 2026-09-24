import { rawId } from '../lib/ids';
import { logger } from '../lib/logger';
import { slack } from './client';
import { memoryThread } from './memory-thread';
import { isModerator } from './moderation';
import { setThreadState, threadState } from './state';

// The memory thread's resource is whoever first brought gorkie into the thread.
async function threadOwner(threadId: string): Promise<string | undefined> {
  const found = await memoryThread(threadId);
  return found ? rawId(found.thread.resourceId) : undefined;
}

export async function focusFilter(
  threadId: string
): Promise<((userId: string) => boolean) | undefined> {
  const focus = (await threadState({ id: threadId }))?.focus;
  if (!focus?.length) {
    return;
  }
  const owner = await threadOwner(threadId).catch((error: unknown) => {
    logger.warn('[focus] could not look up the thread owner', {
      error,
      threadId,
    });
  });
  const allowed = new Set(owner ? [...focus, owner] : focus);
  return (userId) => allowed.has(rawId(userId)) || isModerator(userId);
}

export async function setFocus({
  actorId,
  threadId,
  userIds,
}: {
  actorId: string;
  threadId: string;
  userIds: string[];
}): Promise<{ ok: boolean; text: string }> {
  const owner = await threadOwner(threadId);
  const actor = rawId(actorId);
  // No owner yet means nobody has talked to gorkie here, so the first person
  // to set focus is the one who will own the thread anyway.
  if (owner && owner !== actor && !isModerator(actor)) {
    return {
      ok: false,
      text: `only <@${owner}>, who brought me into this thread, or a gorkie moderator can change focus here.`,
    };
  }
  if (userIds.length === 0) {
    await setThreadState({ thread: { id: threadId }, patch: { focus: [] } });
    return {
      ok: true,
      text: "focus is off. i'll read and answer everyone in this thread again.",
    };
  }
  const focus = [...new Set([actor, ...userIds.map(rawId)])].filter(
    (id) => id !== slack.botUserId
  );
  await setThreadState({ thread: { id: threadId }, patch: { focus } });
  return {
    ok: true,
    text: `focused on ${focus.map((id) => `<@${id}>`).join(', ')}. i'll only read and answer them here${owner && !focus.includes(owner) ? `, plus <@${owner}>` : ''}. \`!focus off\` undoes it.`,
  };
}
