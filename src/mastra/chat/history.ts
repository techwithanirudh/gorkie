import type { Message, Thread } from 'chat';
import { stringifyMarkdown } from 'chat';
import { history as config } from '../config';
import { turnContext } from '../prompts/turn-context';
import type { ThreadState } from '../types';
import { attachmentLabel } from './attachments';
import { isComment, setMessageText } from './message';

export async function prependHistory({
  message,
  state,
  thread,
}: {
  message: Message;
  state: ThreadState | null;
  thread: Thread;
}): Promise<void> {
  if (thread.isDM) {
    return;
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
    const noun = count === 1 ? 'attachment' : 'attachments';
    const files = previous.attachments
      .map((attachment, index) => attachmentLabel({ attachment, index }))
      .join(', ');
    const suffix = count > 0 ? ` [${count} ${noun}: ${files}]` : '';
    lines.push(
      `[${author} (${mention})${bot}] (msg:${previous.id}): ${text}${suffix}`
    );
    if (lines.length >= config.maxUnseenMessages) {
      truncated = true;
      break;
    }
  }

  if (lines.length === 0 && comments === 0) {
    return;
  }

  const header: string[] = [];
  if (lines.length > 0) {
    header.push(turnContext.unseen);
    if (truncated) {
      header.push(turnContext.unseenTruncated);
    }
    header.push(...lines.reverse());
  }
  if (comments > 0) {
    header.push(turnContext.comments(comments));
  }
  setMessageText({ message, text: [...header, '', message.text].join('\n') });
}
