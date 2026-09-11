import type { E2BSandbox } from '@mastra/e2b';
import { CommandExitError } from 'e2b';
import { z } from 'zod';
import { githubAccessToken } from '../../lib/github';
import { logger } from '../../lib/logger';
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

export const branchSchema = z
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

export const git = async ({
  command,
  cwd,
  sandbox,
}: {
  command: string;
  cwd?: string;
  sandbox: E2BSandbox;
}): Promise<string> => {
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
};

export const withCredential = async <T>({
  operation,
  sandbox,
  userId,
}: {
  operation: () => Promise<T>;
  sandbox: E2BSandbox;
  userId: string;
}): Promise<T> => {
  const token = await githubAccessToken(userId);
  if (!token) {
    throw new Error('GitHub is not connected. Ask them to sign in again.');
  }
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
};
