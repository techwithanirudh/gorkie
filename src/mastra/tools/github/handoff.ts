import { slack } from '../../chat/client';
import { rawId } from '../../lib/ids';
import { logger } from '../../lib/logger';

async function threadLink({
  channelId,
  threadId,
}: {
  channelId: string;
  threadId: string;
}): Promise<string | undefined> {
  try {
    const { threadTs } = slack.decodeThreadId(threadId);
    const { permalink } = await slack.webClient.chat.getPermalink({
      channel: rawId(channelId),
      message_ts: threadTs,
    });
    return permalink;
  } catch (error) {
    logger.debug('[github] could not resolve a thread permalink', { error });
  }
}

export async function handoff({
  channelId,
  threadId,
  userId,
}: {
  channelId: string | undefined;
  threadId: string | undefined;
  userId: string;
}): Promise<{ message: string }> {
  const link =
    channelId && threadId
      ? await threadLink({ channelId, threadId })
      : undefined;
  const lines = [
    'Task:',
    '<the task, as you understand it from this thread>',
    channelId ? `Channel: <#${rawId(channelId)}>` : undefined,
    link ? `Thread: ${link}` : undefined,
  ].filter(Boolean);

  return {
    message: `\
GitHub tools stay out of shared threads. A thread is shared, and the account they would act on belongs to one person, so the work moves to a DM with them.

Read this thread and find the task being asked for. DM it to <@${userId}> in this shape, and ask them to reply there when they are ready for you to start, or to correct the task first. The work continues in that DM, where these tools run normally:

${lines.join('\n')}`,
  };
}
