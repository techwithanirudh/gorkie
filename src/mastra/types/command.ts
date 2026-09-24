import type { Message, Thread } from 'chat';
import type { ThreadState } from './thread';

export type CommandHandler = (options: {
  message: Message;
  state: ThreadState | null;
  thread: Thread;
}) => Promise<void>;
