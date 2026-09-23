import type { Thread } from 'chat';
import { type ThreadState, threadStateSchema } from '../types';

export async function threadState(thread: Thread): Promise<ThreadState | null> {
  const state = await thread.state;
  return state ? threadStateSchema.parse(state) : null;
}
