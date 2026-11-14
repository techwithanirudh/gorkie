import type { Message, Thread } from 'chat';

export type CommandHandler = (options: {
  message: Message;
  thread: Thread;
}) => Promise<void>;

// A command that works both as `!name` in a thread and as `/gorkie name`, so it
// returns its reply and each path decides how to deliver it privately.
export type SharedCommand = (options: {
  args: string;
  isDM: boolean;
  prefix: string;
  userId: string;
}) => Promise<string>;
