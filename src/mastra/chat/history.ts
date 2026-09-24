import type { Message, Thread } from 'chat';
import { parseMarkdown, stringifyMarkdown } from 'chat';
import { history as config } from '../config';
import { focusFilter } from './focus';
import { isComment } from './message';
import { threadState } from './state';

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
  const sees = await focusFilter(thread.id);
  const lines: string[] = [];
  let scanned = 0;
  let comments = 0;
  let truncated = false;
  for await (const previous of thread.messages) {
    if (previous.id === state?.lastSeenMessage) {
      break;
    }
    if (scanned >= config.maxScannedMessages) {
      truncated = true;
      break;
    }
    scanned++;
    if (isComment(previous)) {
      comments++;
      continue;
    }
    if (
      previous.id === message.id ||
      previous.author.isMe ||
      (sees && !sees(previous.author.userId))
    ) {
      continue;
    }
    const mention = thread.mentionUser(previous.author.userId);
    const author = previous.author.fullName || previous.author.userName;
    const bot = previous.author.isBot === true ? ' (bot)' : '';
    const text = previous.formatted
      ? stringifyMarkdown(previous.formatted).trim()
      : previous.text;
    const files =
      previous.attachments.length > 0
        ? ` [${previous.attachments.length} attachment${previous.attachments.length === 1 ? '' : 's'}: ${previous.attachments
            .map((file) => {
              const id = file.url?.match(/\bF[A-Z0-9]{6,}\b/)?.[0];
              return [file.name ?? file.type, id ?? file.url]
                .filter(Boolean)
                .join(' ');
            })
            .join(', ')}]`
        : '';
    lines.push(
      `[${author} (${mention})${bot}] (msg:${previous.id}): ${text}${files}`
    );
    if (lines.length >= config.maxUnseenMessages) {
      truncated = true;
      break;
    }
  }

  if (lines.length === 0 && comments === 0) {
    return message;
  }

  const text = [
    ...(lines.length > 0
      ? [
          '[Recent messages in this thread, oldest first, that you have not seen yet]',
          ...(truncated
            ? [
                '[Older unseen messages were left out. Read them with read_conversation_history if they matter.]',
              ]
            : []),
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
