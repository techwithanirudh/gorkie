import { getGitHubCredential } from '../../db/queries/github';
import { listMCPServers } from '../../db/queries/mcps';
import { getGitHubSettings, getInstructions } from '../../db/queries/settings';
import { countInstallations } from '../../lib/github';
import { logger } from '../../lib/logger';
import { slack } from '../client';
import { content } from '../content';
import { githubBlocks } from './github';
import { customInstructionsBlocks } from './instructions';
import { mcpServersBlocks } from './mcp';
import { scheduledTasksBlocks } from './scheduled-tasks';

// One unreadable row would otherwise take the whole tab with it, including the
// Disconnect button that is the only way to clear the row.
async function settled<T>({
  label,
  userId,
  work,
}: {
  label: string;
  userId: string;
  work: Promise<T>;
}): Promise<T | undefined> {
  try {
    return await work;
  } catch (error) {
    logger.error('[app-home] section failed to load', { error, label, userId });
  }
}

async function buildHomeView(userId: string): Promise<Record<string, unknown>> {
  const [instructions, mcpServers, credential, github] = await Promise.all([
    settled({ label: 'instructions', userId, work: getInstructions(userId) }),
    settled({ label: 'mcp', userId, work: listMCPServers(userId) }),
    settled({ label: 'github', userId, work: getGitHubCredential(userId) }),
    settled({ label: 'settings', userId, work: getGitHubSettings(userId) }),
  ]);
  const installations =
    credential?.kind === 'app' ? await countInstallations(credential.token) : 0;

  const staticBlocks = [
    ...content.home.blocks,
    { type: 'divider' },
    ...customInstructionsBlocks(instructions),
    ...githubBlocks({
      credential,
      installations,
      permission: github?.permission ?? 'write',
      threads: github?.threads === true,
      unreadable: github === undefined,
    }),
    ...mcpServersBlocks(mcpServers ?? []),
  ];
  const scheduled =
    (await settled({
      label: 'scheduled',
      userId,
      work: scheduledTasksBlocks(userId, 100 - staticBlocks.length),
    })) ?? [];

  return {
    type: 'home',
    blocks: [...staticBlocks, ...scheduled],
  };
}

export async function publishHome(userId: string): Promise<void> {
  await slack.publishHomeView(userId, await buildHomeView(userId));
}
