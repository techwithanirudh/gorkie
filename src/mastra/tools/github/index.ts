import { createGithubTools, GITHUB_WRITE_TOOLS } from '@github-tools/sdk';
import type { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import { asksBefore } from '../../lib/approval';
import {
  githubAccess,
  githubAccessToken,
  recordGitHubUnauthorized,
} from '../../lib/github';
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
    const access = await githubAccess({ requestContext, userId });
    if (access.state !== 'connected') {
      return {};
    }
    const { level } = access;

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
      // The SDK's formatter is AI SDK shaped; Mastra hands it the result alone.
      const { toModelOutput: format, execute, ...tool } = built[name];
      // An explicit id: Mastra otherwise ids an AI SDK tool as
      // `tool-<hash of description>`, and tool search returns and loads it
      // under that id instead of this key.
      const id = `github_${name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()}`;
      if (!isDM) {
        // Replace the tool outright rather than layering the handoff over the
        // SDK's formatter: those assume a GitHub API result, and
        // listPullRequestFiles maps over it unguarded, so a handoff message
        // throws instead of reaching the model.
        tools[id] = {
          ...tool,
          id,
          needsApproval: false,
          execute: () => handoff({ channelId, threadId, userId }),
        };
        continue;
      }
      tools[id] = {
        ...tool,
        id,
        needsApproval: asksBefore({
          kind: name in GITHUB_WRITE_TOOLS ? 'write' : 'read',
          level,
        }),
        execute: async (...args: Parameters<NonNullable<typeof execute>>) => {
          try {
            return await execute?.(...args);
          } catch (error) {
            if (z.object({ status: z.literal(401) }).safeParse(error).success) {
              await recordGitHubUnauthorized(userId);
            }
            throw error;
          }
        },
        ...(format && {
          toModelOutput: (result: unknown) =>
            result === undefined
              ? result
              : format({ input: undefined, output: result, toolCallId: '' }),
        }),
      };
    }
    if (isDM && threadId) {
      tools.github_checkout = checkoutTool({
        approval: asksBefore({ kind: 'read', level }),
        userId,
      });
      tools.github_push_branch = pushTool({
        approval: asksBefore({ kind: 'write', level }),
        userId,
      });
    }
    return tools;
  } catch (error) {
    logger.warn('[github] failed to build tools', { error, userId });
    return {};
  }
}
