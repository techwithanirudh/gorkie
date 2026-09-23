import { listMCPServers } from '../../db/queries/mcps';
import { githubAccess } from '../../lib/github';
import { logger } from '../../lib/logger';
import type { CommandHandler } from '../../types';

export const connections: CommandHandler = async ({ message, thread }) => {
  const { userId } = message.author;
  const items = ['• context7 (built in)'];

  try {
    const github = await githubAccess({ isDM: thread.isDM, userId });
    items.push(
      `• github: ${github.state === 'connected' ? `connected via ${github.credential.kind}` : 'not connected'}`
    );
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
  await thread
    .postEphemeral(message.author, text, { fallbackToDM: false })
    .catch((error: unknown) => {
      logger.warn('[commands] failed to post connections', {
        error,
        threadId: thread.id,
      });
    });
};
