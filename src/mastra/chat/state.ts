import type { Thread } from 'chat';
import { z } from 'zod';
import type { ThreadState } from '../types';

const threadStateSchema = z.looseObject({
  respondOnThreadMessages: z.boolean().optional(),
  searchToken: z.string().optional(),
  stopped: z.boolean().optional(),
});

export async function threadState(
  thread: Thread | undefined
): Promise<ThreadState | null> {
  const state = await thread?.state;
  return state ? threadStateSchema.parse(state) : null;
}
