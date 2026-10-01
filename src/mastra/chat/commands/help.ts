import type { CommandHandler } from '../../types';
import { notify } from '../notify';

export const help: CommandHandler = async ({ message, thread }) => {
  // TODO(slopradar): duplication : command list is hand-written apart from the `commands` Map in commands/index.ts, so adding a command leaves help stale → store a one-line description beside each Map entry and render help from it
  const text = [
    "*hey, i'm gorkie.* a helpful assistant right here in slack. mention me with anything: questions, code, research, files, or a hand with a task, and i'll pick it up in the thread.",
    '',
    '*commands*',
    '*!help:* show this list.',
    '*!stop:* immediately stop the reply in progress in this thread.',
    "*!compact:* condense this thread's memory now instead of waiting for it to fill up.",
    '*!connections:* list your mcp servers, integrations, and github, with status.',
    '',
    'tip: set your custom instructions and tool display, check how many turns you have left, and manage github, mcp servers, and scheduled tasks from the *home* tab.',
  ].join('\n');
  await notify({ text, thread, user: message.author });
};
