import { createGithubTools } from '@github-tools/sdk';
import { getGitHubSettings } from '../../db/queries/settings';
import { githubAccessToken } from '../../lib/github';
import { logger } from '../../lib/logger';
import { checkoutPolicy, POLICIES, pushPolicy } from './approval';
import { checkoutTool } from './checkout';
import { pushTool } from './push';
import { handoff } from './utils';

function toolName(name: string): string {
  return `github_${name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()}`;
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
    const [connected, settings] = await Promise.all([
      githubAccessToken(userId),
      getGitHubSettings(userId),
    ]);
    if (!connected) {
      return {};
    }
    const direct = isDM || settings.threads;
    // "Never ask" drops the approval card, the only thing binding an action to the
    // person who asked for it. Fine alone in a DM, not in a thread others can steer.
    const permission =
      isDM || settings.permission !== 'never' ? settings.permission : 'write';

    const built = createGithubTools({
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

    const tools: Record<string, unknown> = Object.fromEntries(
      Object.entries(POLICIES).map(([name, policy]) => {
        const tool = built[name as keyof typeof built];
        return [
          toolName(name),
          {
            ...tool,
            needsApproval: policy(permission),
            // A shared thread cannot act on one person's account, so the tool
            // hands back the DM to send instead of a result.
            ...(direct
              ? {}
              : {
                  execute: () => handoff({ channelId, threadId, userId }),
                }),
            toModelOutput: tool.toModelOutput
              ? (result: unknown) =>
                  result === undefined
                    ? result
                    : tool.toModelOutput?.({
                        input: undefined,
                        output: result,
                        toolCallId: '',
                      })
              : undefined,
          },
        ];
      })
    );

    if (!direct) {
      return tools;
    }
    if (threadId) {
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
