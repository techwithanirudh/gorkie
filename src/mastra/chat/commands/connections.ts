import { listMCPServers } from '../../db/queries/mcps';
import { githubAccess } from '../../lib/github';
import { logger } from '../../lib/logger';
import type { CommandHandler } from '../../types';

export const connections: CommandHandler = async ({ message, thread }) => {
  const { userId } = message.author;
  const items = ['• context7 (built in)'];

  try {
    const github = await githubAccess({ isDM: thread.isDM, userId });
    let status = 'could not read it right now';
    if (github.state === 'connected') {
      status = `connected as ${github.credential.login}`;
    } else if (github.state === 'disconnected') {
      status = 'not connected';
    }
    items.push(`• github: ${status}`);
  } catch (error) {
    logger.warn('[commands] failed to read github status', { error, userId });
    items.push('• github: could not read it right now');
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
  await thread
    .postEphemeral(message.author, text, { fallbackToDM: false })
    .catch((error: unknown) => {
      logger.warn('[commands] failed to post connections', {
        error,
        threadId: thread.id,
      });
    });
};
