import { createTool } from '@mastra/core/tools';
import { sandbox as sandboxConfig } from '../../config';
import { sh } from '../../lib/utils';
import { branchSchema, repositorySchema } from '../../types';
import { input } from '../../types/tools/index';
import { requireSandbox } from '../../workspace';
import { git, withCredential } from './git';

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
      'Push a committed branch of a sandbox checkout to GitHub. The branch must already exist locally with the work committed; main and master are refused. Use this when a change spans more than a couple of files, then open the pull request with github_create_pull_request. To push to a fork, set `checkout` to the repo you cloned and `repository` to the fork.',
    requireApproval: approval,
    inputSchema: input({
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
      // The branch lives in the checkout directory. For a normal push that is
      // the target repo; for a fork PR it is the upstream repo that was cloned,
      // not the fork we push to, so the two are tracked apart.
      const source = checkout ?? repository;
      const path = `${sandboxConfig.workdir}/${source.replace('/', '__')}`;
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
            // github_checkout clones shallow (--depth 50), and git refuses a
            // push whose history bottoms out at that boundary. Deepen once and
            // retry rather than handing back a git internals error.
            if (/shallow/i.test(message)) {
              await git({
                command: 'git fetch --unshallow',
                cwd: path,
                sandbox,
              });
              await push();
            } else if (/denied|permission|403|forbidden/i.test(message)) {
              throw new Error(
                `${message}\n\nThis account cannot push to ${repository}. Fork it with github_fork_repository, then call github_push_branch again with checkout set to "${source}" (the repo you cloned) and repository set to your fork, then open the pull request from the fork into ${repository}.`,
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
