import type { SharedCommand } from '../../types';
import { moderationUsage } from '../moderation/commands';
import { isModerator } from '../moderation/gate';

const list = (items: [string, string][]) =>
  items.map(([command, text]) => `• \`${command}\` ${text}`);

export const commandList = (userId: string) =>
  [
    '*Commands:* type `!name` in a thread, or `/gorkie name` anywhere.',
    ...list([
      ['!help', 'show this list'],
      ['!limits', 'see how much of your usage limits you have used'],
      ['!connections', 'your MCP servers, integrations and GitHub'],
    ]),
    '',
    '*In a thread only:*',
    ...list([
      ['!stop', 'stop the current turn and any background work'],
      ['!compact', "condense this thread's memory"],
    ]),
    ...(isModerator(userId)
      ? [
          '',
          '*Moderators:*',
          ...list([
            [`!ban ${moderationUsage.ban}`, 'ban someone'],
            [`!unban ${moderationUsage.unban}`, 'lift a ban'],
            ['!bans', 'list active bans'],
          ]),
        ]
      : []),
    '',
    'To ask me something, mention me. Custom instructions, GitHub, MCP servers and scheduled tasks live in the *Home* tab.',
  ].join('\n');

export const help: SharedCommand = async ({ userId }) =>
  `*hey, i'm gorkie.* mention me with anything: questions, code, research, files, or a hand with a task, and i'll pick it up in the thread.\n\n${commandList(userId)}`;
