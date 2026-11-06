import { Chat } from 'chat';
import { slack } from '../../chat/client';
import { parseSlackInput } from '../../lib/ids';
import type { Target } from '../../types/tools/index';

// Callers run assertCanPostTo first, so a channel or thread target is the
// current conversation, which the bot is already in.
export async function slackDestination(
  target: Target
): Promise<{ channel: string; threadTs?: string }> {
  if (target.type === 'user') {
    const dm = await Chat.getSingleton().openDM(
      parseSlackInput(target.id).channel ?? target.id
    );
    return { channel: slack.decodeThreadId(dm.id).channel };
  }
  if (target.type === 'channel') {
    return { channel: parseSlackInput(target.id).channel ?? target.id };
  }
  const { channel, threadTs } = slack.decodeThreadId(target.id);
  return { channel, threadTs: threadTs || undefined };
}
