import type { Message, Thread } from 'chat';
import { parseMarkdown, stringifyMarkdown } from 'chat';
import { isComment } from './message';
import { threadState } from './state';

const MAX_MESSAGES = 10;
const MAX_SCANNED = 200;

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
  let scanned = 0;
  let comments = 0;
  for await (const previous of thread.messages) {
    if (previous.id === state?.lastSeenMessage || scanned >= MAX_SCANNED) {
      break;
    }
    scanned++;
    if (isComment(previous)) {
      comments++;
      continue;
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
  if (lines.length === 0 && comments === 0) {
    return message;
  }

  const text = [
    ...(lines.length > 0
      ? [
          '[Recent messages in this thread, oldest first, that you have not seen yet]',
          ...lines.reverse(),
        ]
      : []),
    ...(comments > 0
      ? [
          `[${comments} ${comments === 1 ? 'message' : 'messages'} starting with ## were left out. They are side comments nobody addressed to you, so act on them only if asked. Read them with read_conversation_history and includeComments if you need them.]`,
        ]
      : []),
    '',
    message.text,
  ].join('\n');
  message.text = text;
  message.formatted = parseMarkdown(text);
  return message;
}
