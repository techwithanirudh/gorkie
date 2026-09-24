import { logger } from '../../lib/logger';
import type { CommandHandler } from '../../types';

export const help: CommandHandler = async ({ message, thread }) => {
  const text = [
    "*hey, i'm gorkie.* a helpful assistant right here in slack. mention me with anything: questions, code, research, files, or a hand with a task, and i'll pick it up in the thread.",
    '',
    '*commands*',
    '*!help:* show this list.',
    '*!stop:* immediately stop the reply in progress in this thread.',
    "*!compact:* condense this thread's memory now instead of waiting for it to fill up.",
    '*!connections:* list your mcp servers, integrations, and github, with status.',
    '*!focus:* make me read and answer only certain people in this thread: `!focus @someone`, `!focus me`, or `!focus off`. only whoever brought me in (or a moderator) can set it.',
    '*!display:* show or set how tool calls appear in this thread: `hidden`, `compact`, `detailed`, or `reset`.',
    '',
    'tip: set your custom instructions and tool display, check how many turns you have left, and manage github, mcp servers, and scheduled tasks from the *home* tab.',
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
