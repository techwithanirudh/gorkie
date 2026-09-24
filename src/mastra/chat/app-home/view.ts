import { toolDisplay as toolDisplayConfig } from '../../config';
import { getGitHubCredential } from '../../db/queries/github';
import { listMCPServers } from '../../db/queries/mcps';
import { activeBan } from '../../db/queries/moderation';
import {
  getGitHubSettings,
  getInstructions,
  getMCPThreads,
  getToolDisplay,
} from '../../db/queries/settings';
import { turnUsage } from '../../db/queries/usage';
import {
  countInstallations,
  githubAccessToken,
  recordGitHubUnauthorized,
} from '../../lib/github';
import { logger } from '../../lib/logger';
import type { GitHubCredential, HomeSection, TurnUsage } from '../../types';
import { slack } from '../client';
import { content } from '../content';
import { banNotice } from '../moderation/cards';
import { isModerator } from '../moderation/moderators';
import { githubBlocks } from './github';
import { customInstructionsBlocks } from './instructions';
import { fitHome } from './limit';
import { mcpServersBlocks } from './mcp';
import { scheduledTasksBlocks } from './scheduled-tasks';
import { toolDisplayBlocks } from './tool-display';
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

export async function publishHome(userId: string): Promise<void> {
  const ban = await settled({ label: 'ban', userId, work: activeBan(userId) });
  if (ban) {
    await slack.publishHomeView(userId, {
      type: 'home',
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: banNotice(ban.expiresAt) },
        },
      ],
    });
    return;
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
    mcpThreads,
    { credential, unreadable },
    installations,
    github,
    scheduled,
    display,
    usage,
  ] = await Promise.all([
    settled({ label: 'instructions', userId, work: getInstructions(userId) }),
    settled({ label: 'mcp', userId, work: listMCPServers(userId) }),
    settled({ label: 'mcp threads', userId, work: getMCPThreads(userId) }),
    credentialResult,
    credentialResult.then(async ({ credential }) => {
      const token =
        credential && !credential.lastError
          ? await githubAccessToken(userId)
          : undefined;
      if (!token) {
        return 0;
      }
      const installations = await countInstallations(token);
      if ('count' in installations) {
        return installations.count;
      }
      if (installations.status === 401) {
        await recordGitHubUnauthorized(userId);
      }
      return 0;
    }),
    settled({ label: 'settings', userId, work: getGitHubSettings(userId) }),
    settled({
      label: 'scheduled',
      userId,
      work: scheduledTasksBlocks(userId),
    }),
    settled({ label: 'display', userId, work: getToolDisplay(userId) }),
    settled<TurnUsage | 'unlimited'>({
      label: 'usage',
      userId,
      work: isModerator(userId)
        ? Promise.resolve('unlimited')
        : turnUsage(userId),
    }),
  ]);

  const sections: HomeSection[] = [
    { fixed: [...content.home, { type: 'divider' }] },
    customInstructionsBlocks(instructions),
    toolDisplayBlocks(display ?? toolDisplayConfig.default),
    ...(usage ? [usageBlocks(usage)] : []),
    githubBlocks({
      credential,
      installations,
      permission: github?.permission ?? 'all',
      threads: github?.threads === true,
      unreadable,
      userId,
    }),
    mcpServersBlocks({
      servers: mcpServers ?? [],
      threads: mcpThreads === true,
      userId,
    }),
    ...(scheduled ? [scheduled] : []),
  ];

  await slack.publishHomeView(userId, {
    type: 'home',
    blocks: fitHome(sections),
  });
}
