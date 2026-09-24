import { toolDisplay as toolDisplayConfig } from '../../config';
import { getGitHubCredential } from '../../db/queries/github';
import { listMCPServers } from '../../db/queries/mcps';
import {
  getGitHubSettings,
  getInstructions,
  getToolDisplay,
} from '../../db/queries/settings';
import { countInstallations } from '../../lib/github';
import { logger } from '../../lib/logger';
import {
  type GitHubCredential,
  githubPermissionSchema,
  type HomeSection,
} from '../../types';
import { slack } from '../client';
import { content } from '../content';
import { githubBlocks } from './github';
import { customInstructionsBlocks } from './instructions';
import { fitHome } from './limit';
import { mcpServersBlocks } from './mcp';
import { scheduledTasksBlocks } from './scheduled-tasks';
import { toolDisplayBlocks } from './tool-display';

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
    installations,
    github,
    scheduled,
    display,
  ] = await Promise.all([
    settled({ label: 'instructions', userId, work: getInstructions(userId) }),
    settled({ label: 'mcp', userId, work: listMCPServers(userId) }),
    credentialResult,
    credentialResult.then(({ credential }) =>
      credential ? countInstallations(credential.token) : 0
    ),
    settled({ label: 'settings', userId, work: getGitHubSettings(userId) }),
    settled({
      label: 'scheduled',
      userId,
      work: scheduledTasksBlocks(userId),
    }),
    settled({ label: 'display', userId, work: getToolDisplay(userId) }),
  ]);

  const sections: HomeSection[] = [
    { fixed: [...content.home, { type: 'divider' }] },
    customInstructionsBlocks(instructions),
    toolDisplayBlocks(display ?? toolDisplayConfig.default),
    githubBlocks({
      credential,
      installations,
      permission: githubPermissionSchema.parse(github?.permission),
      threads: github?.threads === true,
      unreadable,
      userId,
    }),
    mcpServersBlocks({ servers: mcpServers ?? [], userId }),
    ...(scheduled ? [scheduled] : []),
  ];

  await slack.publishHomeView(userId, {
    type: 'home',
    blocks: fitHome(sections),
  });
}
