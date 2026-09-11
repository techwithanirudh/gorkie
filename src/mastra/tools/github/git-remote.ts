import type { E2BSandbox } from '@mastra/e2b';
import type { SandboxNetworkOpts } from 'e2b';
import { z } from 'zod';
import { sandbox as sandboxConfig } from '../../config';
import { githubAccessToken } from '../../lib/github';
import { logger } from '../../lib/logger';
import type { Repository } from '../../types';
import { baseRules } from '../../workspace/network';

const REPOSITORY_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/;

const BRANCH_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._/-]*[A-Za-z0-9])?$/;
const PROTECTED_BRANCHES = new Set(['main', 'master']);

export const repositorySchema = z.string().refine((value) => {
  // `.` and `..` match the name pattern and would resolve repoDir outside the
  // checkout root, so they are excluded the way git excludes them.
  const [, name] = value.split('/');
  return REPOSITORY_PATTERN.test(value) && name !== '.' && name !== '..';
}, 'Expected "owner/repo".');

export function parseRepository(value: string): Repository {
  const [owner, name] = repositorySchema.parse(value).split('/');
  return { name, owner };
}

export function repoDir(repository: Repository): string {
  return `${sandboxConfig.workdir}/${repository.name}`;
}

export function remoteUrl(repository: Repository): string {
  return `https://github.com/${repository.owner}/${repository.name}.git`;
}

export function validateBranch(branch: string): string | undefined {
  if (
    !BRANCH_PATTERN.test(branch) ||
    branch.includes('..') ||
    branch.includes('//')
  ) {
    return `"${branch}" is not a valid branch name.`;
  }
  if (branch.startsWith('refs/') || branch === 'HEAD') {
    return `"${branch}" is not a plain branch name. Pass the branch name without a refs/ prefix.`;
  }
  if (PROTECTED_BRANCHES.has(branch)) {
    return `Direct pushes to ${branch} are not allowed. Push a feature branch and open a pull request.`;
  }
}

interface Result {
  exitCode: number;
  stderr: string;
  stdout: string;
}

const commandError = z.object({
  result: z.object({
    exitCode: z.number(),
    stderr: z.string(),
    stdout: z.string(),
  }),
});

export async function run(
  sandbox: E2BSandbox,
  command: string,
  cwd?: string
): Promise<Result> {
  try {
    return await sandbox.e2b.commands.run(command, cwd ? { cwd } : undefined);
  } catch (error) {
    const parsed = commandError.safeParse(error);
    if (parsed.success) {
      return parsed.data.result;
    }
    throw error;
  }
}

export function failure(result: Result): string {
  return `git exited ${result.exitCode}: ${`${result.stderr || result.stdout}`.trim()}`;
}

function brokerRules(token: string): NonNullable<SandboxNetworkOpts['rules']> {
  const authorization = `Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
  return {
    ...baseRules(),
    'github.com': [
      { transform: { headers: { Authorization: authorization } } },
    ],
  };
}

export async function withCredential<T>({
  run,
  sandbox,
  userId,
}: {
  run: () => Promise<T>;
  sandbox: E2BSandbox;
  userId: string;
}): Promise<T> {
  const token = await githubAccessToken(userId);
  if (!token) {
    throw new Error('GitHub is not connected. Ask them to sign in again.');
  }
  await sandbox.ensureRunning();
  return await sandbox.retryOnDead(async () => {
    await sandbox.e2b.updateNetwork({ rules: brokerRules(token) });
    try {
      return await run();
    } finally {
      await sandbox.e2b
        .updateNetwork({ rules: baseRules() })
        .catch((error: unknown) =>
          logger.error('[github] failed to drop the credential', { error })
        );
    }
  });
}
