import type { Message, Thread } from 'chat';
import { parseMarkdown, stringifyMarkdown } from 'chat';
import { threadState } from './state';

const MAX_MESSAGES = 10;

export async function withHistory({
  message,
  thread,
}: {
  message: Message;
  thread: Thread;
}): Promise<Message> {
  if (thread.isDM) {
    return message;
  }

  const state = await threadState(thread);
  const lines: string[] = [];
  for await (const previous of thread.messages) {
    if (previous.id === state?.lastSeenMessage) {
      break;
    }
    if (previous.id !== message.id && !previous.author.isMe) {
      const mention = thread.mentionUser(previous.author.userId);
      const author = previous.author.fullName || previous.author.userName;
      const bot = previous.author.isBot === true ? ' (bot)' : '';
      const text = previous.formatted
        ? stringifyMarkdown(previous.formatted).trim()
        : previous.text;
      lines.push(
        `[${author} (${mention})${bot}] (msg:${previous.id}): ${text}`
      );
    }
    if (lines.length >= MAX_MESSAGES) {
      break;
    }
  }

  await thread.setState({ lastSeenMessage: message.id });
  if (lines.length === 0) {
    return message;
  }

  const text = [
    '[Recent messages in this thread, oldest first, that you have not seen yet]',
    ...lines.reverse(),
    '',
    message.text,
  ].join('\n');
  message.text = text;
  message.formatted = parseMarkdown(text);
  return message;
}
