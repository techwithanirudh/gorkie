import { slack } from '../../chat/client';
import { parseSlackInput } from '../../lib/ids';
import { logger } from '../../lib/logger';
import { githubHandoffPrompt } from '../../prompts/github';

export async function handoff({
  channelId,
  threadId,
  userId,
}: {
  channelId: string | undefined;
  threadId: string | undefined;
  userId: string;
}): Promise<{ message: string }> {
  let link: string | undefined;
  if (channelId && threadId) {
    try {
      const { channel, threadTs } = slack.decodeThreadId(threadId);
      link = (
        await slack.webClient.chat.getPermalink({
          channel,
          message_ts: threadTs,
        })
      ).permalink;
    } catch (error) {
      logger.debug('[github] could not resolve a thread permalink', { error });
    }
  }

  return {
    message: githubHandoffPrompt({
      channel: channelId ? parseSlackInput(channelId).channel : undefined,
      link,
      userId,
    }),
  };
}
