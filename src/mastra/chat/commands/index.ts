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

const commands: Record<string, CommandHandler> = {
  compact,
  connections,
  display,
  focus,
  help,
  mcps: connections,
  stop,
};

export async function handleCommand({
  message,
  thread,
}: {
  message: Message;
  thread: Thread;
}): Promise<boolean> {
  const body = withoutLeadingMentions(rawText(message)).trim();
  const match = body.match(/^!(\w+)\b/i);
  const command = match?.[1] ? commands[match[1].toLowerCase()] : undefined;
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
