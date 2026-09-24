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
  if (!isModerator(actor)) {
    // No owner yet means nobody has talked to gorkie here. The Slack thread's
    // root author stands in, so a stranger cannot claim it by focusing first.
    const { channel, threadTs } = slack.decodeThreadId(threadId);
    const starter =
      owner ??
      (threadTs
        ? await slack.webClient.conversations
            .replies({ channel, limit: 1, ts: threadTs })
            .then(
              ({ messages }) => messages?.[0]?.user,
              (error: unknown) => {
                logger.warn('[focus] could not look up the thread root', {
                  error,
                  threadId,
                });
              }
            )
        : undefined);
    if (starter !== actor) {
      return {
        ok: false,
        text: starter
          ? `only <@${starter}> or a gorkie moderator can change focus here.`
          : 'only whoever started this thread or a gorkie moderator can change focus here.',
      };
    }
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
