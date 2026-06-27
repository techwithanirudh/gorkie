import type { Message, Thread } from 'chat';
import type { GorkieThreadState } from '../types';
import { slack } from './slack';
import { rawText, withoutLeadingMentions } from './message';
import { captureSearchToken } from './search-token';

type DefaultHandler = (thread: Thread, message: Message) => Promise<void>;

export function shouldIgnore(message: Message): boolean {
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

export async function onNewMention(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler,
): Promise<void> {
  captureSearchToken(thread.id, message.raw);
  if (shouldIgnore(message)) return;

  if (isThreadRoot(message)) {
    await thread.setState({ respondOnThreadMessages: true });
    await defaultHandler(thread, message);
    return;
  }

  await defaultHandler(thread, message);
  await thread.unsubscribe().catch(() => undefined);
}

export async function onSubscribedMessage(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler,
): Promise<void> {
  captureSearchToken(thread.id, message.raw);
  if (shouldIgnore(message)) return;

  const state = (await thread.state) as GorkieThreadState | null;
  const following = state?.respondOnThreadMessages === true;
  if (!(following || message.isMention)) return;

  if (following) {
    await defaultHandler(thread, message);
    return;
  }

  await defaultHandler(thread, message);
  await thread.unsubscribe().catch(() => undefined);
}

export async function onDirectMessage(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler,
): Promise<void> {
  captureSearchToken(thread.id, message.raw);
  if (shouldIgnore(message)) return;
  await defaultHandler(thread, message);
}
