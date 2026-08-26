import { createGithubTools } from '@github-tools/sdk';
import { getGitHubCredential } from '../../db/queries/github';
import { getGitHubSettings } from '../../db/queries/settings';
import { githubAccessToken } from '../../lib/github';
import { logger } from '../../lib/logger';
import { checkoutPolicy, POLICIES, pushPolicy } from './approval';
import { checkoutTool } from './checkout';
import { pushTool } from './push';
import { handoff } from './utils';

interface BuiltTool {
  toModelOutput?: (args: {
    input: unknown;
    output: unknown;
    toolCallId: string;
  }) => unknown;
}

function modelOutput(tool: BuiltTool) {
  const format = tool.toModelOutput;
  if (!format) {
    return;
  }
  return (result: unknown) =>
    result === undefined
      ? result
      : format({ input: undefined, output: result, toolCallId: '' });
}

export async function githubTools({
  channelId,
  isDM,
  threadId,
  userId,
}: {
  channelId: string | undefined;
  isDM: boolean;
  threadId: string | undefined;
  userId: string;
}): Promise<Record<string, unknown>> {
  try {
    const [credential, settings] = await Promise.all([
      getGitHubCredential(userId),
      getGitHubSettings(userId),
    ]);
    if (!credential) {
      return {};
    }

    const direct = isDM || settings.threads;
    const permission =
      isDM || settings.permission !== 'never' ? settings.permission : 'write';

    const built: Record<string, BuiltTool> = createGithubTools({
      token: async () => {
        const fresh = await githubAccessToken(userId);
        if (!fresh) {
          throw new Error(
            'GitHub is no longer connected for this person. Ask them to sign in again from the Home tab.'
          );
        }
        return fresh;
      },
    });

    const tools: Record<string, unknown> = {};
    for (const [name, policy] of Object.entries(POLICIES)) {
      const tool = built[name];
      if (!tool || (name === 'forkRepository' && credential.kind !== 'pat')) {
        continue;
      }
      const id = `github_${name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()}`;
      tools[id] = {
        ...tool,
        needsApproval: policy(permission),
        toModelOutput: modelOutput(tool),
        ...(direct
          ? {}
          : { execute: () => handoff({ channelId, threadId, userId }) }),
      };
    }
    if (direct && threadId) {
      tools.github_checkout = checkoutTool({
        approval: checkoutPolicy(permission),
        userId,
      });
      tools.github_push_branch = pushTool({
        approval: pushPolicy(permission),
        userId,
      });
    }
    return tools;
  } catch (error) {
    logger.debug('[github] failed to build tools', { error, userId });
    return {};
  }
}
