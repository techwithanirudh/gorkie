import { createTool } from '@mastra/core/tools';
import { sandbox as sandboxConfig } from '../../config';
import { sh } from '../../lib/utils';
import { input } from '../../types/tools/index';
import { requireSandbox } from '../../workspace';
import { branchSchema, git, repositorySchema, withCredential } from './git';

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
      'Push a committed branch of a sandbox checkout to GitHub. The branch must already exist locally with the work committed; main and master are refused. Use this when a change spans more than a couple of files, then open the pull request with github_create_pull_request.',
    requireApproval: approval,
    inputSchema: input({
      repository: repositorySchema.describe(
        'Target repository, as "owner/repo".'
      ),
      branch: branchSchema
        .refine(
          (value) => value !== 'main' && value !== 'master',
          'Direct pushes to main and master are not allowed. Push a feature branch and open a pull request.'
        )
        .describe('Local branch to push.'),
    }),
    execute: async ({ repository, branch }, context) => {
      const sandbox = await requireSandbox(context.requestContext);
      const path = `${sandboxConfig.workdir}/${repository.replace('/', '__')}`;
      const push = () =>
        git({
          command: `git push ${sh(`https://github.com/${repository}.git`)} ${sh(`refs/heads/${branch}:refs/heads/${branch}`)}`,
          cwd: path,
          sandbox,
        });
      return await withCredential({
        operation: async () => {
          try {
            await push();
          } catch (error) {
            const message = error instanceof Error ? error.message : `${error}`;
            // github_checkout clones shallow, and git refuses a push whose
            // history bottoms out at that boundary. Deepen once and retry
            // rather than handing back a git internals error.
            if (/shallow/i.test(message)) {
              await git({
                command: 'git fetch --unshallow',
                cwd: path,
                sandbox,
              });
              await push();
            } else if (/denied|permission|403|forbidden/i.test(message)) {
              throw new Error(
                `${message}\n\nThis account cannot push to ${repository}. Fork it with github_fork_repository, push this same branch to the fork, then open the pull request from the fork into ${repository}. Do that rather than reporting that write access is missing.`,
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
