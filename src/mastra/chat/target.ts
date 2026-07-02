import type { Channel, Thread } from 'chat';
import { z } from 'zod';
import { chat } from './instance';

export const targetSchema = z.object({
  type: z.enum(['thread', 'channel', 'user']).describe('Target kind.'),
  id: z
    .string()
    .min(1)
    .describe(
      'Chat SDK id: thread (slack:C...:ts), channel (slack:C...), or a user id.'
    ),
});

export type Target = z.infer<typeof targetSchema>;

export async function resolveTarget(target: Target): Promise<Channel | Thread> {
  if (target.type === 'channel') {
    return chat().channel(target.id);
  }
  if (target.type === 'user') {
    return await chat().openDM(target.id);
  }
  return chat().thread(target.id);
}
