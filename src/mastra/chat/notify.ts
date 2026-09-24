import type { Author, Thread } from 'chat';
import { logger } from '../lib/logger';

// Ephemeral everywhere, DMs included, and never a DM fallback: the notice
// stays in the conversation it answers and only its reader sees it.
export async function notify({
  text,
  thread,
  user,
}: {
  text: string;
  thread: Thread<unknown> | null;
  user: Author;
}): Promise<void> {
  if (!thread) {
    return;
  }
  await thread
    .postEphemeral(user, text, { fallbackToDM: false })
    .catch((error: unknown) =>
      logger.warn('[chat] could not send a notice', {
        error,
        threadId: thread.id,
        userId: user.userId,
      })
    );
}
