import { logger } from '../../lib/logger';
import type { CommandHandler } from '../../types';

const COMMANDS: [string, string][] = [
  ['!help', 'show this list.'],
  [
    '!stop',
    'immediately stop the current turn and any background work in this thread.',
  ],
  [
    '!connections',
    'list your mcp servers, integrations, and github, with status.',
  ],
];

export const help: CommandHandler = async ({ message, thread }) => {
  const text = [
    "*hey, i'm gorkie.* a helpful assistant right here in slack. mention me with anything: questions, code, research, files, or a hand with a task, and i'll pick it up in the thread.",
    '',
    '*commands*',
    ...COMMANDS.map(([command, description]) => `*${command}:* ${description}`),
    '',
    'tip: set your custom instructions and manage github, mcp servers, and scheduled tasks from the *home* tab.',
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
