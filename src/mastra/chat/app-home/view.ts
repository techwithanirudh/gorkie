import { listMCPServers } from '../../db/queries/mcps';
import { getInstructions } from '../../db/queries/settings';
import { slack } from '../client';
import { content } from '../content';
import { customInstructionsBlocks } from './custom-instructions';
import { mcpServersBlocks } from './mcp-servers';
import { scheduledTasksBlocks } from './scheduled-tasks';

async function buildHomeView(userId: string): Promise<Record<string, unknown>> {
  const [instructions, mcpServers] = await Promise.all([
    getInstructions(userId),
    listMCPServers(userId),
  ]);

  const staticBlocks = [
    ...content.home.blocks,
    { type: 'divider' },
    ...customInstructionsBlocks(instructions),
    ...mcpServersBlocks(mcpServers),
  ];
  // Slack's views.publish rejects a Home view with more than 100 blocks.
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
