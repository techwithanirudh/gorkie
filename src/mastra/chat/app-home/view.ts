import { getGitHubCredential } from '../../db/queries/github';
import { listMCPServers } from '../../db/queries/mcps';
import { getGitHubSettings, getInstructions } from '../../db/queries/settings';
import { countInstallations } from '../../lib/github';
import { slack } from '../client';
import { content } from '../content';
import { githubBlocks } from './github';
import { customInstructionsBlocks } from './instructions';
import { mcpServersBlocks } from './mcp';
import { scheduledTasksBlocks } from './scheduled-tasks';

async function buildHomeView(userId: string): Promise<Record<string, unknown>> {
  const [instructions, mcpServers, credential, github] = await Promise.all([
    getInstructions(userId),
    listMCPServers(userId),
    getGitHubCredential(userId),
    getGitHubSettings(userId),
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
      permission: github.permission,
      threads: github.threads,
    }),
    ...mcpServersBlocks(mcpServers),
  ];
  const scheduled = await scheduledTasksBlocks(
    userId,
    100 - staticBlocks.length
  );

  return {
    type: 'home',
    blocks: [...staticBlocks, ...scheduled],
  };
}

export async function publishHome(userId: string): Promise<void> {
  await slack.publishHomeView(userId, await buildHomeView(userId));
}
