import { logger } from '../../lib/logger';
import type { CommandHandler } from '../../types';

export const help: CommandHandler = async ({ message, thread }) => {
  const text = [
    "*hey, i'm gorkie.* a helpful assistant right here in slack. mention me with anything: questions, code, research, files, or a hand with a task, and i'll pick it up in the thread.",
    '',
    '*commands*',
    '*!help:* show this list.',
    '*!stop:* immediately stop the reply in progress in this thread.',
    '*!connections:* list your mcp servers, integrations, and github, with status.',
    '*!display:* show or set how tool calls appear in this thread: `hidden`, `compact`, `detailed`, or `reset`.',
    '',
    'tip: set your custom instructions and tool display, and manage github, mcp servers, and scheduled tasks from the *home* tab.',
  ].join('\n');
  await thread
    .postEphemeral(message.author, text, { fallbackToDM: false })
    .catch((error: unknown) => {
      logger.warn('[commands] failed to post help', {
        error,
        threadId: thread.id,
      });
    });
};
