import type { Message, Thread } from 'chat';
import type { GorkieThreadState } from '../types';
import { slack } from './slack';
import { rawText, withoutLeadingMentions } from './message';
import { captureSearchToken } from './search-token';
import { copySlackFilesIntoSandbox } from './attachments';

type DefaultHandler = (thread: Thread, message: Message) => Promise<void>;

function shouldIgnore(message: Message): boolean {
  for (const line of rawText(message).split('\n')) {
    if (withoutLeadingMentions(line).trimStart().startsWith('##')) return true;
  }
  return false;
}

function isThreadRoot(message: Message): boolean {
  try {
    return slack.decodeThreadId(message.threadId).threadTs === message.id;
  } catch {
    return false;
  }
}

async function respond(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler,
): Promise<void> {
  await defaultHandler(thread, await copySlackFilesIntoSandbox(thread, message));
}

export async function onMention(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler,
): Promise<void> {
  captureSearchToken(thread.id, message.raw);
  if (shouldIgnore(message)) return;
  if (isThreadRoot(message)) await thread.setState({ respondOnThreadMessages: true });
  await respond(thread, message, defaultHandler);
}

export async function onSubscribedMessage(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler,
): Promise<void> {
  captureSearchToken(thread.id, message.raw);
  if (shouldIgnore(message)) return;
  const state = (await thread.state) as GorkieThreadState | null;
  if (!(state?.respondOnThreadMessages === true || message.isMention)) return;
  await respond(thread, message, defaultHandler);
}

export async function onDirectMessage(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler,
): Promise<void> {
  captureSearchToken(thread.id, message.raw);
  if (shouldIgnore(message)) return;
  await respond(thread, message, defaultHandler);
}
