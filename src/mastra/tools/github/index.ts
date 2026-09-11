import {
  createGithubTools,
  GITHUB_WRITE_TOOLS,
  type GithubToolName,
} from '@github-tools/sdk';
import type { RequestContext } from '@mastra/core/request-context';
import { githubAccess, githubAccessToken } from '../../lib/github';
import { logger } from '../../lib/logger';
import { asksBefore } from '../../types';
import { checkoutTool, pushTool } from './git';
import { handoff } from './handoff';

const EXPOSED: GithubToolName[] = [
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
    for (const name of EXPOSED) {
      // An app structurally cannot fork a repository it is not installed on.
      if (name === 'forkRepository' && credential.kind !== 'pat') {
        continue;
      }
      const tool = built[name];
      // The SDK's formatter is AI SDK shaped; Mastra hands it the result alone.
      const format = tool.toModelOutput;
      const id = `github_${name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()}`;
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
