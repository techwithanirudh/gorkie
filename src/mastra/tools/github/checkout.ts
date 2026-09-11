import { createTool } from '@mastra/core/tools';
import { sandbox as sandboxConfig } from '../../config';
import { shellQuote } from '../../lib/utils';
import { input } from '../../types/tools/index';
import { requireSandbox } from '../../workspace';
import { branchSchema, git, repositorySchema, withCredential } from './git';

export const checkoutTool = ({
  approval,
  userId,
}: {
  approval: boolean;
  userId: string;
}) =>
  createTool({
    id: 'github_checkout',
    description:
      'Clone a repository into the sandbox and check out a branch, so you can build, test, and edit across many files. Required before github_push_branch: the sandbox holds no GitHub credentials, so a plain git clone fails. Safe to run again.',
    requireApproval: approval,
    inputSchema: input({
      repository: repositorySchema.describe(
        'Repository to check out, as "owner/repo".'
      ),
      branch: branchSchema
        .optional()
        .describe(
          'An existing branch to fetch and check out, such as a pull request branch. Omit to stay on the default branch.'
        ),
    }),
    execute: async ({ repository, branch }, context) => {
      const sandbox = await requireSandbox(context.requestContext);
      const path = `${sandboxConfig.workdir}/${repository.split('/')[1]}`;
      const remote = `https://github.com/${repository}.git`;
      return await withCredential({
        operation: async () => {
          await git({
            command: `test -d ${shellQuote(`${path}/.git`)} || git clone --depth 50 ${shellQuote(remote)} ${shellQuote(path)}`,
            sandbox,
          });
          if (branch) {
            await git({
              command: `git fetch ${shellQuote(remote)} ${shellQuote(branch)} && git checkout -B ${shellQuote(branch)} FETCH_HEAD`,
              cwd: path,
              sandbox,
            });
          }
          return {
            path,
            sha: await git({
              command: 'git rev-parse HEAD',
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
