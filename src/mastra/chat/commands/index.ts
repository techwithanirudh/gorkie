import type { Message, Thread } from 'chat';
import type { CommandHandler } from '../../types';
import { rawText, withoutLeadingMentions } from '../message';
import { compact } from './compact';
import { connections } from './connections';
import { display } from './display';
import { help } from './help';
import { stop } from './stop';

const commands: Record<string, CommandHandler> = {
  compact,
  connections,
  display,
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
  await command({ message, thread });
  return true;
}
