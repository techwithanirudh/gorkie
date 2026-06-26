import type { Message } from 'chat';

/**
 * Ignore any message that has a line starting with `##`. We use `##` as an
 * "internal / don't respond" marker — handy for posting notes in a thread the
 * bot is subscribed to without triggering a reply.
 */
export function shouldIgnore(message: Message): boolean {
  for (const line of (message.text ?? '').split('\n')) {
    if (line.trimStart().startsWith('##')) return true;
  }
  return false;
}
