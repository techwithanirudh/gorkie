import type { Message, Thread } from 'chat';
import { logger } from '../logger';
import type { GorkieThreadState } from '../types';
import { copyFilesToSandbox } from './attachments';
import { rawText, withoutLeadingMentions } from './message';
import { captureSearchToken } from './search-token';
import { slack } from './slack';

type DefaultHandler = (thread: Thread, message: Message) => Promise<void>;

function shouldIgnore(message: Message): boolean {
  if (
    message.author.isBot === true ||
    message.author.userId === 'USLACKBOT' ||
    message.author.isMe === true
  ) {
    return true;
  }
  for (const line of rawText(message).split('\n')) {
    if (withoutLeadingMentions(line).trimStart().startsWith('##')) {
      return true;
    }
  }
  return false;
}

async function respond(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler
): Promise<void> {
  logger.info('[chat] turn started', {
    threadId: thread.id,
    author: message.author.userName,
    attachments: message.attachments.length,
    text: message.text,
  });
  await defaultHandler(thread, await copyFilesToSandbox(thread, message));
}

export async function onMention(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler
): Promise<void> {
  captureSearchToken(thread.id, message.raw);
  if (shouldIgnore(message)) {
    return;
  }
  if (slack.decodeThreadId(message.threadId).threadTs === message.id) {
    await thread.setState({ respondOnThreadMessages: true });
  }
  await respond(thread, message, defaultHandler);
}

export async function onSubscribedMessage(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler
): Promise<void> {
  captureSearchToken(thread.id, message.raw);
  if (shouldIgnore(message)) {
    return;
  }
  const state = (await thread.state) as GorkieThreadState | null;
  if (!(state?.respondOnThreadMessages === true || message.isMention)) {
    return;
  }
  await respond(thread, message, defaultHandler);
}

export async function onDirectMessage(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler
): Promise<void> {
  captureSearchToken(thread.id, message.raw);
  if (shouldIgnore(message)) {
    return;
  }
  await respond(thread, message, defaultHandler);
}
