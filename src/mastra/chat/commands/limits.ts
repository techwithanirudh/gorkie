import { usage } from '../../lib/limits';
import { logger } from '../../lib/logger';
import type { CommandHandler } from '../../types';

export const limits: CommandHandler = async ({ message, thread }) => {
  const lines = (await usage(message.author.userId)).map(
    ({ max, noun, used }) => `• ${noun}: ${used} of ${max}`
  );
  await thread
    .postEphemeral(
      message.author,
      [
        '*usage this hour*',
        ...lines,
        'resets at the top of each hour, and when gorkie restarts.',
      ].join('\n'),
      { fallbackToDM: false }
    )
    .catch((error: unknown) => {
      logger.warn('[commands] failed to post limits', {
        error,
        threadId: thread.id,
      });
    });
};
