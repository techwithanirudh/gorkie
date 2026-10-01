import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { sandbox as sandboxConfig } from '../../config';
import { channelContext } from '../../lib/context';
import { sh } from '../../lib/shell';
import { branchSchema, repositorySchema } from '../../types';
import { requireSandbox } from '../../workspace';
import { checkoutPath, git, repoAccessFor, withCredential } from './git';

const inspectRepository = async ({
  repository,
  userId,
}: {
  repository: string;
  userId: string;
}) => {
  const access = await repoAccessFor({ repository, userId });
  if ('error' in access) {
    return { canPush: false, needsCredential: true };
  }
  return { canPush: access.push, needsCredential: access.needsCredential };
};

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
    // TODO(slopradar): inconsistent tool shape : github_checkout and github_push_branch (push.ts) are the only tools in scope with no outputSchema or transform.display, so their widget falls back to the generic label → add outputSchema { path, sha, note } and a display summary like the other tools
    execute: async ({ repository, branch }, context) => {
      const sandbox = await requireSandbox(context.requestContext);
      const path = checkoutPath(repository);
      const remote = `https://github.com/${repository}.git`;

      // TODO(slopradar): repeated reads : requireApproval above already ran inspectRepository, so every approved checkout does two token lookups and two GET /repos calls → cache the access result per tool call (keyed by repository in the requestContext) or have repoAccess memoize per request like githubAccess
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
        ? await withCredential({
            operation: clone,
            sandbox,
            threadId: channelContext(context.requestContext).threadId,
            userId,
          })
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
        note: `${edit} You do not have push access to this repo, and Gorkie cannot fork (the GitHub App only pushes where it is installed). You can read and open issues here, but not push changes. Say so, and offer the diff or a patch they can apply and open the pull request themselves.`,
      };
    },
  });
