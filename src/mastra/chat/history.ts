import type { Message, Thread } from 'chat';
import { parseMarkdown, stringifyMarkdown } from 'chat';
import { history as config } from '../config';
import type { ThreadState } from '../types';
import { attachmentLabel } from './attachments';
import { isComment } from './message';

export async function withHistory({
  message,
  state,
  thread,
}: {
  message: Message;
  state: ThreadState | null;
  thread: Thread;
}): Promise<Message> {
  if (thread.isDM) {
    return message;
  }

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
    if (previous.id === message.id || previous.author.isMe) {
      continue;
    }
    const mention = thread.mentionUser(previous.author.userId);
    const author = previous.author.fullName || previous.author.userName;
    const bot = previous.author.isBot === true ? ' (bot)' : '';
    const text = previous.formatted
      ? stringifyMarkdown(previous.formatted).trim()
      : previous.text;
    const count = previous.attachments.length;
    const files = previous.attachments
      .map((attachment, index) => attachmentLabel({ attachment, index }))
      .join(', ');
    // TODO(slopradar): nested ternary in template : plural and attachment suffix ternaries nested inside one template literal → build `files` suffix in a named const before the push
    lines.push(
      `[${author} (${mention})${bot}] (msg:${previous.id}): ${text}${count > 0 ? ` [${count} attachment${count === 1 ? '' : 's'}: ${files}]` : ''}`
    );
    if (lines.length >= config.maxUnseenMessages) {
      truncated = true;
      break;
    }
  }

  if (lines.length === 0 && comments === 0) {
    return message;
  }

  const header: string[] = [];
  if (lines.length > 0) {
    header.push(
      // TODO(slopradar): prompt copy outside prompts/ : model-facing instructions (x3 in this file, also attachments.ts:57) live in chat code → move the strings to `src/mastra/prompts/` and import them
      '[Recent messages in this thread, oldest first, that you have not seen yet]'
    );
    if (truncated) {
      header.push(
        '[Older unseen messages were left out. Read them with read_conversation_history if they matter.]'
      );
    }
    header.push(...lines.reverse());
  }
  if (comments > 0) {
    header.push(
      `[${comments} ${comments === 1 ? 'message' : 'messages'} starting with ## were left out. They are side comments nobody addressed to you, so act on them only if asked. Read them with read_conversation_history and includeComments if you need them.]`
    );
  }
  const text = [...header, '', message.text].join('\n');
  // TODO(slopradar): mutated argument : overwrites the caller's Message (attachments.ts:61 does the same) so the `return message` hides a side effect → either name it `prependHistory(message): void` or return a copied Message; share one `setMessageText` with attachments.ts
  message.text = text;
  message.formatted = parseMarkdown(text);
  return message;
}
