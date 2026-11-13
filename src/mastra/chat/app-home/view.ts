import { getGitHubCredential } from '../../db/queries/github';
import { listMCPServers } from '../../db/queries/mcps';
import { getGitHubSettings, getInstructions } from '../../db/queries/settings';
import { countInstallations } from '../../lib/github';
import { usage } from '../../lib/limits';
import { logger } from '../../lib/logger';
import type { GitHubCredential } from '../../types';
import { slack } from '../client';
import { content } from '../content';
import { banNotice } from '../moderation/cards';
import { banStatus } from '../moderation/gate';
import { heading, note } from './blocks';
import { githubBlocks } from './github';
import { customInstructionsBlocks } from './instructions';
import { fitHome, type HomeSection } from './limit';
import { mcpServersBlocks } from './mcp';
import { scheduledTasksBlocks } from './scheduled-tasks';
import { usageBlocks } from './usage';

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
  const ban = await banStatus(userId);
  if (ban.status === 'banned') {
    return {
      type: 'home',
      blocks: [
        heading('Banned From Gorkie'),
        note(banNotice(ban.ban.expiresAt)),
      ],
    };
  }
  const credentialResult: Promise<{
    credential: GitHubCredential | undefined;
    unreadable: boolean;
  }> = getGitHubCredential(userId).then(
    (credential) => ({ credential, unreadable: false }),
    (error) => {
      logger.error('[app-home] section failed to load', {
        error,
        label: 'github',
        userId,
      });
      return { credential: undefined, unreadable: true };
    }
  );

  const [
    instructions,
    mcpServers,
    { credential, unreadable },
    github,
    scheduled,
    usageRows,
  ] = await Promise.all([
    settled({ label: 'instructions', userId, work: getInstructions(userId) }),
    settled({ label: 'mcp', userId, work: listMCPServers(userId) }),
    credentialResult,
    settled({ label: 'settings', userId, work: getGitHubSettings(userId) }),
    settled({
      label: 'scheduled',
      userId,
      work: scheduledTasksBlocks(userId),
    }),
    settled({ label: 'usage', userId, work: usage(userId) }),
  ]);
  const installations = credential
    ? await countInstallations(credential.token)
    : 0;

  const sections: HomeSection[] = [
    { fixed: [...content.home.blocks, { type: 'divider' }] },
    customInstructionsBlocks(instructions),
    githubBlocks({
      credential,
      installations,
      permission: github?.permission ?? 'write',
      threads: github?.threads === true,
      unreadable,
    }),
    mcpServersBlocks(mcpServers ?? []),
    ...(scheduled ? [scheduled] : []),
    ...(usageRows ? [usageBlocks(usageRows)] : []),
  ];

  return { type: 'home', blocks: fitHome(sections) };
}

export async function publishHome(userId: string): Promise<void> {
  await slack.publishHomeView(userId, await buildHomeView(userId));
}
