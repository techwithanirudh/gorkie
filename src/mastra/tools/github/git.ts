import { createTool } from '@mastra/core/tools';
import type { E2BSandbox } from '@mastra/e2b';
import { CommandExitError } from 'e2b';
import { z } from 'zod';
import { sandbox as sandboxConfig } from '../../config';
import { githubAccessToken } from '../../lib/github';
import { logger } from '../../lib/logger';
import { input } from '../../types/tools/index';
import { requireSandbox } from '../../workspace';
import { baseRules } from '../../workspace/network';

export const repositorySchema = z
  .string()
  .regex(
    /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/,
    'Expected "owner/repo".'
  )
  // `.` and `..` match the name pattern and would resolve the checkout path
  // outside the workdir, so they are excluded the way git excludes them.
  .refine(
    (value) => !['.', '..'].includes(value.split('/')[1]),
    'Expected "owner/repo".'
  );

// Both commands below interpolate a branch inside single quotes, so the
// absence of quote characters here is what keeps that safe.
const branchSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9](?:[A-Za-z0-9._/-]*[A-Za-z0-9])?$/,
    'Not a valid branch name.'
  )
  .refine(
    (value) => !(value.includes('..') || value.includes('//')),
    'Not a valid branch name.'
  )
  .refine(
    (value) => !(value.startsWith('refs/') || value === 'HEAD'),
    'Pass the branch name without a refs/ prefix.'
  );

async function git({
  command,
  cwd,
  sandbox,
}: {
  command: string;
  cwd?: string;
  sandbox: E2BSandbox;
}): Promise<string> {
  try {
    const { stdout } = await sandbox.e2b.commands.run(
      command,
      cwd ? { cwd } : undefined
    );
    return stdout.trim();
  } catch (error) {
    if (error instanceof CommandExitError) {
      throw new Error(
        `git exited ${error.exitCode}: ${(error.stderr || error.stdout).trim()}`,
        { cause: error }
      );
    }
    throw error;
  }
}

async function withCredential<T>({
  operation,
  sandbox,
  userId,
}: {
  operation: () => Promise<T>;
  sandbox: E2BSandbox;
  userId: string;
}): Promise<T> {
  const token = await githubAccessToken(userId);
  if (!token) {
    throw new Error('GitHub is not connected. Ask them to sign in again.');
  }
  await sandbox.ensureRunning();
  return await sandbox.retryOnDead(async () => {
    // Brokered at the firewall rather than handed to the sandbox, so the token
    // never exists inside the VM for anything else to read.
    await sandbox.e2b.updateNetwork({
      rules: {
        ...baseRules(),
        'github.com': [
          {
            transform: {
              headers: {
                Authorization: `Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
              },
            },
          },
        ],
      },
    });
    try {
      return await operation();
    } finally {
      await sandbox.e2b
        .updateNetwork({ rules: baseRules() })
        .catch((error: unknown) =>
          logger.error('[github] failed to drop the credential', { error })
        );
    }
  });
}

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
            command: `test -d ${path}/.git || git clone --depth 50 ${remote} ${path}`,
            sandbox,
          });
          if (branch) {
            await git({
              command: `git fetch ${remote} '${branch}' && git checkout -B '${branch}' FETCH_HEAD`,
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
}

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
      const path = `${sandboxConfig.workdir}/${repository.split('/')[1]}`;
      return await withCredential({
        operation: async () => {
          try {
            await git({
              command: `git push https://github.com/${repository}.git 'refs/heads/${branch}:refs/heads/${branch}'`,
              cwd: path,
              sandbox,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : `${error}`;
            throw new Error(
              /denied|permission|403|forbidden/i.test(message)
                ? `${message}\n\nThis account cannot push to ${repository}. Fork it with github_fork_repository, push this same branch to the fork, then open the pull request from the fork into ${repository}. Do that rather than reporting that write access is missing.`
                : message,
              { cause: error }
            );
          }
          return {
            branch,
            sha: await git({
              command: `git rev-parse '${branch}'`,
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
}
