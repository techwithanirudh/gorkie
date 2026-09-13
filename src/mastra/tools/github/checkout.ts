import { createTool } from '@mastra/core/tools';
import { sandbox as sandboxConfig } from '../../config';
import { channelContext } from '../../lib/context';
import { githubAccess, githubAccessToken } from '../../lib/github';
import { repoAccess } from '../../lib/github/api';
import { sh } from '../../lib/utils';
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
      'Clone a repository into the sandbox and check out a branch, so you can build, test, and edit across many files. Required before github_push_branch: pushing needs the repo present in the sandbox first. Safe to run again.',
    // Only a private clone opens the ambient github.com credential window on the
    // sandbox, which is the thing worth a human confirmation. A public repo
    // clones anonymously, so it needs no approval. When the user's policy says
    // never ask (`approval` false) we never gate; otherwise we gate only private
    // repos, and gate on any uncertainty (no token / API error).
    requireApproval: approval
      ? async ({ repository }) => {
          const token = await githubAccessToken(userId);
          if (!token) {
            return true;
          }
          const access = await repoAccess({ repository, token });
          return 'error' in access ? true : access.private;
        }
      : false,
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
      const path = `${sandboxConfig.workdir}/${repository.replace('/', '__')}`;
      const remote = `https://github.com/${repository}.git`;

      const token = await githubAccessToken(userId);
      const access = token
        ? await repoAccess({ repository, token })
        : { error: 'no token' as const };
      // A public repo clones with no auth, so it needs neither the credential
      // window nor the approval that gates it; only a private clone opens
      // ambient github.com auth. Anything we can't confirm public (no token, API
      // error) takes the credentialed path. (A repo flipped public->private in
      // the window between the approval check and here would clone anonymously
      // and simply fail, never opening an ungated credential window.)
      const isPrivate = 'error' in access ? true : access.private;

      const clone = async () => {
        await git({
          command: `test -d ${sh(`${path}/.git`)} || git clone --depth 50 ${sh(remote)} ${sh(path)}`,
          sandbox,
        });
        if (branch) {
          await git({
            command: `git fetch ${sh(remote)} ${sh(branch)} && git checkout -B ${sh(branch)} FETCH_HEAD`,
            cwd: path,
            sandbox,
          });
        }
        return await git({ command: 'git rev-parse HEAD', cwd: path, sandbox });
      };

      const sha = isPrivate
        ? await withCredential({ operation: clone, sandbox, userId })
        : await clone();

      const edit = `Edit files in the sandbox under ${path}.`;
      if ('push' in access && access.push) {
        return {
          path,
          sha,
          note: `${edit} You can push to this repo: github_push_branch to push a new branch, then github_create_pull_request. No API tool writes files or branches, and you cannot touch a default branch.`,
        };
      }

      // No push access: the only route is a fork, and only a PAT can fork (an
      // app pushes only where it is installed). `githubAccess` is memoized on
      // the request, so this re-read is a cache hit.
      const resolved = await githubAccess({
        isDM: channelContext(context.requestContext).isDM === true,
        requestContext: context.requestContext,
        userId,
      });
      const canFork =
        resolved.state === 'connected' && resolved.credential.kind === 'pat';
      return {
        path,
        sha,
        note: canFork
          ? `${edit} You do not have push access to this repo. Fork it with github_fork_repository, then github_push_branch to push a branch to your fork, then github_create_pull_request from the fork to the original.`
          : `${edit} You do not have push access to this repo and this GitHub connection cannot fork (an app only pushes where it is installed). You can read and open issues here, but not push changes. Say so rather than attempting a push that will fail.`,
      };
    },
  });
