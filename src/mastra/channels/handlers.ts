import type { Message, Thread } from 'chat';
import type { GorkieThreadState } from '../types';
import { slack } from './slack';

type DefaultHandler = (thread: Thread, message: Message) => Promise<void>;

// `##` marks a message as internal: a note in a thread that shouldn't get a reply.
export function shouldIgnore(message: Message): boolean {
  for (const line of (message.text ?? '').split('\n')) {
    if (line.trimStart().startsWith('##')) return true;
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

// Subscription model (ported from v1): pinged at a thread's start → follow the
// whole thread; pinged mid-thread → answer that ping only and detach, so the next
// ping re-routes through onNewMention and channels re-fetches recent context.
// Channels checks subscription before mentions, so once subscribed even @mentions
// arrive via onSubscribedMessage; both handlers cover that.
export async function onNewMention(
  thread: Thread,
  message: Message,
  defaultHandler: DefaultHandler,
): Promise<void> {
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
  if (shouldIgnore(message)) return;
  await defaultHandler(thread, message);
}
