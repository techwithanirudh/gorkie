import type { E2BSandbox } from '@mastra/e2b';
import { CommandExitError } from 'e2b';
import { z } from 'zod';
import { sandbox as sandboxConfig } from '../../config';
import { githubAccessToken } from '../../lib/github';
import { logger } from '../../lib/logger';
import { baseRules } from '../../workspace/network';

export const repositorySchema = z
  .string()
  .regex(
    /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/,
    'Expected "owner/repo".'
  )
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
    const { stdout } = await sandbox.e2b.commands.run(command, {
      ...(cwd ? { cwd } : {}),
      timeoutMs: sandboxConfig.gitTimeout,
    });
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

// One credential window per sandbox at a time. Two overlapping operations
// interleave badly: the first's cleanup resets the firewall while the second is
// still pushing, and each one's window stays open for the other's duration.
const windows = new Map<string, Promise<unknown>>();

const serialize = async <T>(
  key: string,
  work: () => Promise<T>
): Promise<T> => {
  const next = (windows.get(key) ?? Promise.resolve()).then(work, work);
  const settled = next.then(
    () => undefined,
    () => undefined
  );
  windows.set(key, settled);
  try {
    return await next;
  } finally {
    if (windows.get(key) === settled) {
      windows.delete(key);
    }
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
  return await serialize(sandbox.e2b.sandboxId, () =>
    sandbox.retryOnDead(async () => {
      try {
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
      } catch {
        // The rules object holds the github token in an Authorization header, so
        // never let a failure here propagate the raw error: it could carry the
        // request body into a log. Throw a token-free error instead.
        // biome-ignore lint/style/useErrorCause: dropping the cause is the point; it can carry the token
        throw new Error('Could not open the GitHub credential window.');
      }
      try {
        return await operation();
      } finally {
        // Drop the ambient github.com auth as soon as the git command is done. A
        // failed drop leaves the credential window open on the sandbox, so retry
        // a few times before giving up rather than dropping it on the first blip.
        let dropped = false;
        for (let attempt = 1; attempt <= 3 && !dropped; attempt++) {
          try {
            // biome-ignore lint/performance/noAwaitInLoops: retries are sequential
            await sandbox.e2b.updateNetwork({ rules: baseRules() });
            dropped = true;
          } catch (error) {
            logger.error('[github] failed to drop the credential', {
              attempt,
              error,
            });
          }
        }
      }
    })
  );
};
