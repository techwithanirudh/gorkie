import type { E2BSandbox } from '@mastra/e2b';
import { CommandExitError } from 'e2b';
import { sandbox as sandboxConfig } from '../../config';
import { githubAccessToken } from '../../lib/github';
import { logger } from '../../lib/logger';
import { baseRules } from '../../workspace/network';

// github_push_branch finds the clone github_checkout made by this path.
export const checkoutPath = (repository: string): string =>
  `${sandboxConfig.workdir}/${repository.replace('/', '__')}`;

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

const credentialWindows = new Map<string, Promise<unknown>>();

const oneWindowPerSandbox = async <T>({
  sandboxId,
  work,
}: {
  sandboxId: string;
  work: () => Promise<T>;
}): Promise<T> => {
  const next = (credentialWindows.get(sandboxId) ?? Promise.resolve()).then(
    work,
    work
  );
  const settled = next.then(
    () => undefined,
    () => undefined
  );
  credentialWindows.set(sandboxId, settled);
  try {
    return await next;
  } finally {
    if (credentialWindows.get(sandboxId) === settled) {
      credentialWindows.delete(sandboxId);
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
  return await oneWindowPerSandbox({
    sandboxId: sandbox.e2b.sandboxId,
    work: () =>
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
          // biome-ignore lint/style/useErrorCause: dropping the cause is the point; it can carry the token
          throw new Error('Could not open the GitHub credential window.');
        }
        const [outcome] = await Promise.allSettled([operation()]);
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
        if (!dropped) {
          await sandbox.e2b.kill().catch((error: unknown) => {
            logger.error('[github] failed to kill a credentialed sandbox', {
              error,
            });
          });
          throw new Error(
            'Could not close the GitHub credential window, so the sandbox was discarded. Files in it are gone; check out the repository again.'
          );
        }
        if (outcome.status === 'rejected') {
          throw outcome.reason;
        }
        return outcome.value;
      }),
  });
};
