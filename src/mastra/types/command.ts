import type { Message, Thread } from 'chat';

export type CommandHandler = (options: {
  message: Message;
  thread: Thread;
}) => Promise<void>;

export type SharedCommand = (options: {
  args: string;
  isDM: boolean;
  prefix: string;
  userId: string;
}) => Promise<string>;
