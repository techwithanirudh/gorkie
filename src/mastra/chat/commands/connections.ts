import { listMCPServers } from '../../db/queries/mcps';
import { githubAccess } from '../../lib/github';
import { logger } from '../../lib/logger';
import type { CommandHandler } from '../../types';
import { notify } from '../notify';

export const connections: CommandHandler = async ({ message, thread }) => {
  const { userId } = message.author;
  const items = ['• context7 (built in)'];

  try {
    const github = await githubAccess({ userId });
    let status = 'not connected';
    if (github.state === 'connected') {
      status = github.credential.lastError
        ? `failed (${github.credential.lastError})`
        : `connected as ${github.credential.login}`;
    }
    items.push(`• github: ${status}`);
  } catch (error) {
    logger.warn('[commands] failed to read github status', { error, userId });
  }

  try {
    for (const server of await listMCPServers(userId)) {
      items.push(
        `• ${server.name}: ${server.lastError ? `failed (${server.lastError})` : 'connected'}`
      );
    }
  } catch (error) {
    logger.warn('[commands] failed to list mcp servers', { error, userId });
    items.push('• mcp servers: could not read them right now');
  }

  const text = [
    '*your connections*',
    ...items,
    '',
    'manage these from the *home* tab.',
  ].join('\n');
  await notify({ text, thread, user: message.author });
};
