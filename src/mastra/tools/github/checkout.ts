import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { sandbox as sandboxConfig } from '../../config';
import { githubAccessToken } from '../../lib/github';
import { repoAccess } from '../../lib/github/api';
import { sh } from '../../lib/utils';
import { branchSchema, repositorySchema } from '../../types';
import { requireSandbox } from '../../workspace';
import { checkoutPath, git, withCredential } from './git';

const inspectRepository = async ({
  repository,
  userId,
}: {
  repository: string;
  userId: string;
}) => {
  const token = await githubAccessToken(userId);
  const access = token ? await repoAccess({ repository, token }) : undefined;
  if (!access || 'error' in access) {
    return { canPush: false, needsCredential: true };
  }
  return { canPush: access.push, needsCredential: access.needsCredential };
};

export const checkoutTool = ({
  approval,
  canFork,
  userId,
}: {
  approval: boolean;
  canFork: boolean;
  userId: string;
}) =>
  createTool({
    id: 'github_checkout',
    description:
      'Clone a repository into the sandbox and check out a branch, so you can build, test, and edit across many files. Required before github_push_branch: pushing needs the repo present in the sandbox first. Safe to run again.',
    requireApproval: approval
      ? async ({ repository }) =>
          (await inspectRepository({ repository, userId })).needsCredential
      : false,
    inputSchema: z.strictObject({
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
      const path = checkoutPath(repository);
      const remote = `https://github.com/${repository}.git`;

      const { canPush, needsCredential } = await inspectRepository({
        repository,
        userId,
      });

      const clone = async () => {
        await git({
          command: `test -d ${sh(`${path}/.git`)} || git clone --depth ${sandboxConfig.cloneDepth} ${sh(remote)} ${sh(path)}`,
          sandbox,
        });
        const target = branch
          ? sh(branch)
          : '"$(git symbolic-ref --short refs/remotes/origin/HEAD | sed s@^origin/@@)"';
        await git({
          command: `target=${target} && git fetch ${sh(remote)} "$target" && git checkout -B "$target" FETCH_HEAD`,
          cwd: path,
          sandbox,
        });
        return await git({ command: 'git rev-parse HEAD', cwd: path, sandbox });
      };

      const sha = needsCredential
        ? await withCredential({ operation: clone, sandbox, userId })
        : await clone();

      const edit = `Edit files in the sandbox under ${path}.`;
      if (canPush) {
        return {
          path,
          sha,
          note: `${edit} You can push to this repo: github_push_branch to push a new branch, then github_create_pull_request. No API tool writes files or branches, and you cannot touch a default branch.`,
        };
      }

      return {
        path,
        sha,
        note: canFork
          ? `${edit} You do not have push access to this repo. Fork it with github_fork_repository, then github_push_branch to push a branch to your fork, then github_create_pull_request from the fork to the original.`
          : `${edit} You do not have push access to this repo and this GitHub connection cannot fork (an app only pushes where it is installed). You can read and open issues here, but not push changes. Say so rather than attempting a push that will fail.`,
      };
    },
  });
