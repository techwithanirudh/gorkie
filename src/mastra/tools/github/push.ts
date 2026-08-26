import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { input } from '../../types/tools/index';
import { getSandbox } from '../../workspace';
import {
  failure,
  isRepository,
  remoteUrl,
  repoDir,
  run,
  validateBranch,
  withCredential,
} from './git-remote';

export function pushTool({
  approval,
  userId,
}: {
  approval: boolean;
  userId: string;
}) {
  return createTool({
    id: 'github_push_branch',
    description:
      'Push a committed branch of a sandbox checkout to GitHub. The branch must already exist locally with the work committed; main and master are refused. Use this rather than github_create_or_update_file when a change spans more than a couple of files, then open the pull request with github_create_pull_request.',
    requireApproval: approval,
    inputSchema: input({
      repository: z
        .string()
        .refine(isRepository, { message: 'Expected "owner/repo".' })
        .describe('Target repository, as "owner/repo".'),
      branch: z
        .string()
        .min(1)
        .superRefine((value, ctx) => {
          const refusal = validateBranch(value);
          if (refusal) {
            ctx.addIssue({ code: 'custom', message: refusal });
          }
        })
        .describe('Local branch to push.'),
    }),
    execute: async ({ repository, branch }, context) => {
      const sandbox = await getSandbox(context.requestContext);
      if (!sandbox) {
        throw new Error('No sandbox available.');
      }
      const path = repoDir(repository);
      const remote = remoteUrl(repository);
      return await withCredential({
        run: async () => {
          const pushed = await run(
            sandbox,
            `git push ${remote} 'refs/heads/${branch}:refs/heads/${branch}'`,
            path
          );
          if (pushed.exitCode !== 0) {
            const message = failure(pushed);
            throw new Error(
              /denied|permission|403|forbidden/i.test(message)
                ? `${message}\n\nThis account cannot push to ${repository}. Fork it with github_fork_repository, push this same branch to the fork, then open the pull request from the fork into ${repository}. Do that rather than reporting that write access is missing.`
                : message
            );
          }
          const head = await run(sandbox, `git rev-parse '${branch}'`, path);
          return { branch, sha: `${head.stdout}`.trim() };
        },
        sandbox,
        userId,
      });
    },
  });
}
