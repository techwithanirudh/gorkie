import type { Message, Thread } from 'chat';
import { logger } from '../../lib/logger';
import type { CommandHandler, ThreadState } from '../../types';
import { rawText, withoutLeadingMentions } from '../message';
import { sentBeforeStop } from '../state';
import { compact } from './compact';
import { connections } from './connections';
import { display } from './display';
import { focus } from './focus';
import { help } from './help';
import { stop } from './stop';

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
  state,
  thread,
}: {
  message: Message;
  state: ThreadState | null;
  thread: Thread;
}): Promise<boolean> {
  const body = withoutLeadingMentions(rawText(message)).trim();
  const name = body.match(/^!(\w+)\b/)?.[1]?.toLowerCase();
  const command = name ? commands.get(name) : undefined;
  if (!command) {
    return false;
  }
  if (command !== stop && sentBeforeStop({ message, state })) {
    logger.debug('[commands] dropped, sent before a stop or leave', {
      messageId: message.id,
      threadId: thread.id,
    });
    return true;
  }
  await command({ message, thread });
  return true;
}
