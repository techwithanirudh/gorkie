import { toolDisplay as toolDisplayConfig } from '../../config';
import { getGitHubCredential } from '../../db/queries/github';
import { listMCPServers } from '../../db/queries/mcps';
import { activeBan } from '../../db/queries/moderation';
import { getUserSettings } from '../../db/queries/settings';
import { turnUsage } from '../../db/queries/usage';
import { logger } from '../../lib/logger';
import type { GitHubCredential, HomeSection, TurnUsage } from '../../types';
import { slack } from '../client';
import { content } from '../content';
import { banNotice } from '../moderation/cards';
import { isModerator } from '../moderation/moderators';
import { githubBlocks } from './github/blocks';
import { githubInstallations } from './github/installations';
import { customInstructionsBlocks } from './instructions/blocks';
import { fitHome } from './limit';
import { mcpServersBlocks } from './mcp/blocks';
import { scheduledTasksBlocks } from './scheduled-tasks/blocks';
import { toolDisplayBlocks } from './tool-display/blocks';
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
    settings,
    mcpServers,
    { credential, unreadable },
    installations,
    scheduled,
    usage,
  ] = await Promise.all([
    settled({ label: 'settings', userId, work: getUserSettings(userId) }),
    settled({ label: 'mcp', userId, work: listMCPServers(userId) }),
    credentialResult,
    settled({
      label: 'installations',
      userId,
      work: credentialResult.then(({ credential }) =>
        githubInstallations({ credential, userId })
      ),
    }),
    settled({
      label: 'scheduled',
      userId,
      work: scheduledTasksBlocks(userId),
    }),
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
    customInstructionsBlocks(settings?.instructions),
    toolDisplayBlocks(settings?.toolDisplay ?? toolDisplayConfig.default),
    ...(usage ? [usageBlocks(usage)] : []),
    githubBlocks({
      credential,
      installations: installations ?? 0,
      permission: settings?.github.permission ?? 'all',
      threads: settings?.github.threads === true,
      unreadable,
      userId,
    }),
    mcpServersBlocks({
      servers: mcpServers ?? [],
      userId,
    }),
    ...(scheduled ? [scheduled] : []),
  ];

  await slack.publishHomeView(userId, {
    type: 'home',
    blocks: fitHome(sections),
  });
}

// The Home refresh reads the DB and calls GitHub, so it must not hold a Slack
// ack: Chat SDK answers view_submission only after the submit handler returns.
export function refreshHome(userId: string): void {
  publishHome(userId).catch((error: unknown) =>
    logger.warn('[app-home] could not refresh the Home tab', { error, userId })
  );
}
