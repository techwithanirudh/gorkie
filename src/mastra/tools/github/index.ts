import { createGithubTools, GITHUB_WRITE_TOOLS } from '@github-tools/sdk';
import type { RequestContext } from '@mastra/core/request-context';
import { asksBefore } from '../../lib/approval';
import { githubAccess, githubAccessToken } from '../../lib/github';
import { logger } from '../../lib/logger';
import { ALLOWLIST } from './allowlist';
import { checkoutTool } from './checkout';
import { handoff } from './handoff';
import { pushTool } from './push';

export async function githubTools({
  channelId,
  isDM,
  requestContext,
  threadId,
  userId,
}: {
  channelId: string | undefined;
  isDM: boolean;
  requestContext?: RequestContext;
  threadId: string | undefined;
  userId: string;
}): Promise<Record<string, unknown>> {
  try {
    const access = await githubAccess({ isDM, requestContext, userId });
    if (access.state !== 'connected') {
      return {};
    }
    const { credential, direct, level } = access;

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

    const tools: Record<string, unknown> = {};
    for (const name of ALLOWLIST) {
      // An app structurally cannot fork a repository it is not installed on.
      if (name === 'forkRepository' && credential.kind !== 'pat') {
        continue;
      }
      // The SDK's formatter is AI SDK shaped; Mastra hands it the result alone.
      const { toModelOutput: format, ...tool } = built[name];
      const id = `github_${name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()}`;
      if (!direct) {
        // Replace the tool outright rather than layering the handoff over the
        // SDK's formatter: those assume a GitHub API result, and
        // listPullRequestFiles maps over it unguarded, so a handoff message
        // throws instead of reaching the model.
        tools[id] = {
          ...tool,
          needsApproval: false,
          execute: () => handoff({ channelId, threadId, userId }),
        };
        continue;
      }
      tools[id] = {
        ...tool,
        needsApproval: asksBefore({
          kind: name in GITHUB_WRITE_TOOLS ? 'write' : 'read',
          level,
        }),
        ...(format && {
          toModelOutput: (result: unknown) =>
            result === undefined
              ? result
              : format({ input: undefined, output: result, toolCallId: '' }),
        }),
      };
    }
    if (direct && threadId) {
      tools.github_checkout = checkoutTool({
        approval: !isDM || asksBefore({ kind: 'read', level }),
        canFork: credential.kind === 'pat',
        userId,
      });
      tools.github_push_branch = pushTool({
        approval: asksBefore({ kind: 'write', level }),
        canFork: credential.kind === 'pat',
        userId,
      });
    }
    return tools;
  } catch (error) {
    logger.warn('[github] failed to build tools', { error, userId });
    return {};
  }
}
