import type { Message, Thread } from 'chat';
import type { CommandHandler } from '../../types';
import { rawText, withoutLeadingMentions } from '../message';
import { stop } from './stop';

const commands: Record<string, CommandHandler> = {
  stop,
};

// Returns true if handled, so callers should skip normal agent processing.
export async function handleCommand(
  thread: Thread,
  message: Message
): Promise<boolean> {
  const body = withoutLeadingMentions(rawText(message)).trim();
  const match = body.match(/^!(\w+)\b/i);
  const command = match?.[1] ? commands[match[1].toLowerCase()] : undefined;
  if (!command) {
    return false;
  }
  await command(thread, message);
  return true;
}
