import type { Message, Thread } from 'chat';

export type CommandHandler = (
  thread: Thread,
  message: Message
) => Promise<void>;
