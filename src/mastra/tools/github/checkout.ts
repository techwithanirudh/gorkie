import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { input } from '../../types/tools/index';
import { getSandbox } from '../../workspace';
import {
  failure,
  parseRepository,
  remoteUrl,
  repoDir,
  repositorySchema,
  run,
  validateBranch,
  withCredential,
} from './git-remote';

export function checkoutTool({
  approval,
  userId,
}: {
  approval: boolean;
  userId: string;
}) {
  return createTool({
    id: 'github_checkout',
    description:
      'Clone a repository into the sandbox and check out a branch, so you can build, test, and edit across many files. Required before github_push_branch: the sandbox holds no GitHub credentials, so a plain git clone fails. Safe to run again.',
    requireApproval: approval,
    inputSchema: input({
      repository: repositorySchema.describe(
        'Repository to check out, as "owner/repo".'
      ),
      branch: z
        .string()
        .optional()
        .describe(
          'An existing branch to fetch and check out, such as a pull request branch. Omit to stay on the default branch.'
        ),
    }),
    execute: async ({ repository, branch }, context) => {
      const refusal = branch ? validateBranch(branch) : undefined;
      if (refusal) {
        throw new Error(refusal);
      }
      const sandbox = await getSandbox(context.requestContext);
      if (!sandbox) {
        throw new Error('No sandbox available.');
      }
      const repo = parseRepository(repository);
      const path = repoDir(repo);
      const remote = remoteUrl(repo);
      return await withCredential({
        run: async () => {
          const cloned = await run(sandbox, `test -d ${path}/.git`);
          if (cloned.exitCode !== 0) {
            const created = await run(
              sandbox,
              `git clone --depth 50 ${remote} ${path}`
            );
            if (created.exitCode !== 0) {
              throw new Error(failure(created));
            }
          }
          if (branch) {
            const fetched = await run(
              sandbox,
              `git fetch ${remote} '${branch}' && git checkout -B '${branch}' FETCH_HEAD`,
              path
            );
            if (fetched.exitCode !== 0) {
              throw new Error(failure(fetched));
            }
          }
          const head = await run(sandbox, 'git rev-parse HEAD', path);
          return { path, sha: `${head.stdout}`.trim() };
        },
        sandbox,
        userId,
      });
    },
  });
}
