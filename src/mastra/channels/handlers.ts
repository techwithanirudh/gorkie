import type { Message, Thread } from 'chat';
import { slack } from './slack';

type DefaultHandler = (thread: Thread, message: Message) => Promise<void>;

/** Per-thread state we persist via Chat SDK's thread state store. */
interface GorkieThreadState {
  /** True once gorkie was pinged at the start of a thread → follow every message. */
  respondOnThreadMessages?: boolean;
}

/**
 * Ignore any message with a line starting with `##` — an "internal / don't
 * respond" marker for leaving notes in a thread without triggering a reply.
 */
export function shouldIgnore(message: Message): boolean {
  for (const line of (message.text ?? '').split('\n')) {
    if (line.trimStart().startsWith('##')) return true;
  }
  return false;
}

/** True when this message is the root of its thread (the thread starts with it). */
function isThreadRoot(message: Message): boolean {
  try {
    return slack.decodeThreadId(message.threadId).threadTs === message.id;
  } catch {
    return false;
  }
}

/**
 * Subscription model, ported from the original gorkie:
 *
 *  - Pinged at the START of a thread (root mention) → gorkie follows the whole
 *    thread and replies to every message. We record `respondOnThreadMessages` and
 *    let channels keep the subscription. Channels does NOT re-fetch history while
 *    subscribed (it sees every message live), which avoids bloating context.
 *
 *  - Pinged MID-thread → gorkie answers that one ping only. We drop the
 *    subscription so the next message routes back through `onNewMention`, where
 *    channels re-fetches the last N messages (with its multi-user prefixing) so
 *    gorkie has fresh context — and intervening chatter never triggers a reply.
 *
 * Channels checks subscription before mentions, so once a thread is subscribed
 * even @mentions arrive via `onSubscribedMessage`; both handlers cover that.
 */
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

  // A mention in a thread we aren't following: answer once, then detach.
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
