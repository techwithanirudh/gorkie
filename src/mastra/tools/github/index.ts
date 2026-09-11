import { createGithubTools, GITHUB_WRITE_TOOLS } from '@github-tools/sdk';
import type { RequestContext } from '@mastra/core/request-context';
import { githubAccess, githubAccessToken } from '../../lib/github';
import { logger } from '../../lib/logger';
import { asksBefore } from '../../types';
import { checkoutTool } from './checkout';
import { pushTool } from './push';
import { handoff } from './utils';

const EXPOSED = [
  'addAssignees',
  'addIssueComment',
  'addLabels',
  'addPullRequestComment',
  'closeIssue',
  'compareCommits',
  'createIssue',
  'createPullRequest',
  'forkRepository',
  'getCiFailureContext',
  'getCommit',
  'getFileContent',
  'getIssueContext',
  'getPullRequestContext',
  'getRepository',
  'getRepositoryTree',
  'listBranches',
  'listCheckRuns',
  'listCommits',
  'listIssueComments',
  'listIssues',
  'listLabels',
  'listPullRequestFiles',
  'listPullRequestReviews',
  'listPullRequests',
  'removeAssignees',
  'removeLabel',
  'requestReviewers',
  'searchCode',
  'searchIssues',
  'searchRepositories',
  'updateIssue',
  'updatePullRequest',
];

const WRITES = new Set<string>(Object.values(GITHUB_WRITE_TOOLS));

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
    for (const name of EXPOSED) {
      const tool = built[name];
      if (!tool || (name === 'forkRepository' && credential.kind !== 'pat')) {
        continue;
      }
      const id = `github_${name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()}`;
      tools[id] = {
        ...tool,
        needsApproval: asksBefore({
          kind: WRITES.has(name) ? 'write' : 'read',
          level,
        }),
        toModelOutput: modelOutput(tool),
        ...(direct
          ? {}
          : { execute: () => handoff({ channelId, threadId, userId }) }),
      };
    }
    if (direct && threadId) {
      tools.github_checkout = checkoutTool({
        approval: !isDM || asksBefore({ kind: 'read', level }),
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
