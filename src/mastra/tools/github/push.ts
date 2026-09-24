import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { githubAccessToken } from '../../lib/github';
import { repoAccess } from '../../lib/github/api';
import { sh } from '../../lib/utils';
import { branchSchema, repositorySchema } from '../../types';
import { requireSandbox } from '../../workspace';
import { checkoutPath, git, withCredential } from './git';

// The schema only knows main and master; a repo whose default is anything else
// is caught only by asking GitHub, so a push that cannot confirm it is refused.
async function refuseDefaultBranch({
  branch,
  repository,
  userId,
}: {
  branch: string;
  repository: string;
  userId: string;
}): Promise<void> {
  // TODO(slopradar): simplification: duplicate | same token + repoAccess pair as checkout.ts:18-19 | use the shared `repoAccessFor` from lib/github/api
  const token = await githubAccessToken(userId);
  const access = token ? await repoAccess({ repository, token }) : undefined;
  if (!access || 'error' in access || !access.defaultBranch) {
    throw new Error(
      `Could not confirm the default branch of ${repository}${access && 'error' in access ? ` (${access.error})` : ''}, so the push was not attempted.`
    );
  }
  if (branch === access.defaultBranch) {
    throw new Error(
      `${branch} is the default branch of ${repository}, and direct pushes to it are not allowed. Push a feature branch and open a pull request.`
    );
  }
}

export const pushTool = ({
  approval,
  userId,
}: {
  approval: boolean;
  userId: string;
}) =>
  createTool({
    id: 'github_push_branch',
    description:
      'Push a committed branch of a sandbox checkout to GitHub. The branch must already exist locally with the work committed; the default branch, main, and master are refused. Then open the pull request with github_create_pull_request. To push to a fork the app is installed on (for example their own fork), set `checkout` to the repo you cloned and `repository` to the fork. Gorkie cannot create forks.',
    requireApproval: approval,
    inputSchema: z.strictObject({
      repository: repositorySchema.describe(
        'Where to push, as "owner/repo". For a fork PR this is the fork; otherwise the same repo you checked out.'
      ),
      checkout: repositorySchema
        .optional()
        .describe(
          'The repo you cloned that holds this branch, when it differs from the push target (i.e. pushing to a fork). Defaults to the push target.'
        ),
      branch: branchSchema
        .refine(
          (value) => value !== 'main' && value !== 'master',
          'Direct pushes to main and master are not allowed. Push a feature branch and open a pull request.'
        )
        .describe('Local branch to push.'),
    }),
    execute: async ({ repository, branch, checkout }, context) => {
      const sandbox = await requireSandbox(context.requestContext);
      const path = checkoutPath(checkout ?? repository);
      await refuseDefaultBranch({ branch, repository, userId });
      const remote = `https://github.com/${repository}.git`;
      const push = () =>
        git({
          command: `git push ${sh(remote)} ${sh(`refs/heads/${branch}:refs/heads/${branch}`)}`,
          cwd: path,
          sandbox,
        });
      return await withCredential({
        operation: async () => {
          try {
            await push();
          } catch (error) {
            const message = error instanceof Error ? error.message : `${error}`;
            if (/shallow/i.test(message)) {
              await git({
                command: 'git fetch --unshallow',
                cwd: path,
                sandbox,
              });
              await push();
            } else if (/denied|permission|403|forbidden/i.test(message)) {
              throw new Error(
                `${message}

This GitHub App connection cannot push to ${repository}, because an app only reaches repositories it is installed on. Say so, and offer the diff or a patch so they can open the pull request themselves.`,
                { cause: error }
              );
            } else {
              throw error;
            }
          }
          return {
            branch,
            sha: await git({
              command: `git rev-parse ${sh(branch)}`,
              cwd: path,
              sandbox,
            }),
          };
        },
        sandbox,
        userId,
      });
    },
  });
