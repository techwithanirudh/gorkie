import type { Message, Thread } from 'chat';
import { logger } from '../../lib/logger';
import type { CommandHandler } from '../../types';
import { rawText, withoutLeadingMentions } from '../message';
import { threadState } from '../state';
import { compact } from './compact';
import { connections } from './connections';
import { display } from './display';
import { focus } from './focus';
import { help } from './help';
import { stop } from './stop';

// A Map, not an object literal: `!constructor` or `!__proto__` must not
// resolve to an Object.prototype member.
const commands = new Map<string, CommandHandler>([
  ['compact', compact],
  ['connections', connections],
  ['display', display],
  ['focus', focus],
  ['help', help],
  ['mcps', connections],
  ['stop', stop],
]);

export async function handleCommand({
  message,
  thread,
}: {
  message: Message;
  thread: Thread;
}): Promise<boolean> {
  const body = withoutLeadingMentions(rawText(message)).trim();
  const name = body.match(/^!(\w+)\b/)?.[1]?.toLowerCase();
  const command = name ? commands.get(name) : undefined;
  if (!command) {
    return false;
  }
  // A command queued behind a stop or leave_thread is dropped like any other
  // message. !stop always runs: it sets that cutoff, and a repeat is harmless.
  if (command !== stop) {
    const cutoff = (await threadState(thread))?.dropMessagesBefore;
    if (cutoff && message.metadata.dateSent.getTime() < cutoff) {
      logger.debug('[commands] dropped, sent before a stop or leave', {
        messageId: message.id,
        threadId: thread.id,
      });
      return true;
    }
  }
  await command({ message, thread });
  return true;
}
