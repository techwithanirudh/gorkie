import { commands } from '../../prompts/commands';
import type { CommandHandler } from '../../types';
import { notify } from '../notify';

export const help: CommandHandler = async ({ message, thread }) => {
  const text = [
    "*hey, i'm gorkie.* a helpful assistant right here in slack. mention me with anything: questions, code, research, files, or a hand with a task, and i'll pick it up in the thread.",
    '',
    '*commands*',
    ...Object.entries(commands).map(
      ([name, description]) => `*!${name}:* ${description}`
    ),
    '',
    'tip: set your custom instructions and tool display, check how many turns you have left, and manage github, mcp servers, and scheduled tasks from the *home* tab.',
  ].join('\n');
  await notify({ text, thread, user: message.author });
};
