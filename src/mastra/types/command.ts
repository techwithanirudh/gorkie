import type { Message, Thread } from 'chat';

export type CommandHandler = (options: {
  message: Message;
  thread: Thread;
}) => Promise<void>;
