import type { E2BSandbox } from '@mastra/e2b';
import { CommandExitError } from 'e2b';
import { sandbox as sandboxConfig } from '../../config';
import { githubAccessToken } from '../../lib/github';
import { logger } from '../../lib/logger';
import { sh } from '../../lib/utils';
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
    // These run inside the credential window, so config the agent wrote must
    // not run a program or redirect a push while GitHub auth is attached.
    // Env config beats repo config and reaches every git in a compound command,
    // unlike `-c`. Keys it cannot pin (url.<x>.insteadOf and filter.<x>.*,
    // including ones pulled in by include.path) are refused instead.
    const pins = [
      ['core.hooksPath', '/dev/null'],
      ['core.fsmonitor', 'false'],
      // Empty stops git falling back to GIT_ASKPASS-style programs.
      ['core.askPass', ''],
      // Empty resets the helper list.
      ['credential.helper', ''],
      // Only https; ext::, file:// and ssh run programs or skip the proxy.
      ['protocol.allow', 'never'],
      ['protocol.https.allow', 'always'],
      ['submodule.recurse', 'false'],
      ['fetch.recurseSubmodules', 'false'],
      ['push.recurseSubmodules', 'no'],
    ];
    const { stdout } = await sandbox.e2b.commands.run(
      `if git config -z --list --name-only 2>/dev/null | grep -qizE ${sh(String.raw`^(url\..*\.(push)?insteadof|filter\.)`)}; then echo 'refused: git config sets url.*.insteadOf or filter.*, remove it first' >&2; exit 97; fi; ${command}`,
      {
        ...(cwd ? { cwd } : {}),
        envs: {
          // The agent can write ~/.gitconfig and /etc/gitconfig too.
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_CONFIG_COUNT: `${pins.length}`,
          ...Object.fromEntries(
            pins.flatMap(([key, value], index) => [
              [`GIT_CONFIG_KEY_${index}`, key],
              [`GIT_CONFIG_VALUE_${index}`, value],
            ])
          ),
        },
        timeoutMs: sandboxConfig.gitTimeout,
      }
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
