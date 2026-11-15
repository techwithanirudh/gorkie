import type { Message, Thread } from 'chat';
import type { CommandHandler, SharedCommand } from '../../types';
import { rawText, withoutLeadingMentions } from '../message';
import { ban, bans, unban } from '../moderation/commands';
import { notify } from '../notify';
import { compact } from './compact';
import { connections } from './connections';
import { help } from './help';
import { limits } from './limits';
import { stop } from './stop';

export const threadCommands: Record<string, CommandHandler> = {
  compact,
  stop,
};

export const sharedCommands: Record<string, SharedCommand> = {
  ban,
  bans,
  connections,
  help,
  limits,
  mcps: connections,
  unban,
};

export async function handleCommand({
  message,
  thread,
}: {
  message: Message;
  thread: Thread;
}): Promise<boolean> {
  const body = withoutLeadingMentions(rawText(message)).trim();
  const [, name = '', args = ''] = body.match(/^!(\w+)\b\s*(.*)$/is) ?? [];
  const threadCommand = threadCommands[name.toLowerCase()];
  if (threadCommand) {
    await threadCommand({ message, thread });
    return true;
  }
  const shared = sharedCommands[name.toLowerCase()];
  if (!shared) {
    return false;
  }
  const text = await shared({
    args,
    isDM: thread.isDM,
    prefix: '!',
    userId: message.author.userId,
  });
  await notify({ text, thread, user: message.author });
  return true;
}
