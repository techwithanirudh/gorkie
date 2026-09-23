import type { Thread } from 'chat';
import { z } from 'zod';
import type { ThreadState } from '../types';

const threadStateSchema = z.looseObject({
  lastSeenMessage: z.string().optional(),
  respondOnThreadMessages: z.boolean().optional(),
});

export async function threadState(thread: Thread): Promise<ThreadState | null> {
  const state = await thread.state;
  return state ? threadStateSchema.parse(state) : null;
}
