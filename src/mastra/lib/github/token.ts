import { refreshToken } from '@octokit/oauth-methods';
import { z } from 'zod';
import { env } from '@/env';
import {
  type GitHubCredential,
  getGitHubCredential,
  removeGitHubCredential,
  setGitHubCredential,
} from '../../db/queries/github';
import { logger } from '../logger';
import { githubApi } from './api';
import { toAccount } from './device-flow';

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const refreshes = new Map<string, Promise<string | undefined>>();

async function refreshAccount({
  account,
  spent,
  userId,
}: {
  account: GitHubCredential;
  spent: string;
  userId: string;
}): Promise<string | undefined> {
  try {
    const { authentication } = await refreshToken({
      clientId: env.GITHUB_APP_CLIENT_ID,
      clientSecret: env.GITHUB_APP_CLIENT_SECRET,
      clientType: 'github-app',
      refreshToken: spent,
    });
    const refreshed = toAccount(authentication);
    await setGitHubCredential({
      credential: {
        ...refreshed,
        kind: 'app',
        login: account.login,
        scopes: [],
      },
      userId,
    });
    return refreshed.token;
  } catch (error) {
    logger.warn('[github] token refresh failed', { error, userId });
    const current = await getGitHubCredential(userId);
    if (current && current.refreshToken !== spent) {
      return current.token;
    }
    await removeGitHubCredential(userId);
  }
}

export async function githubAccessToken(
  userId: string
): Promise<string | undefined> {
  const account = await getGitHubCredential(userId);
  if (!account) {
    return;
  }
  if (account.kind === 'pat') {
    return account.token;
  }
  const expiresSoon =
    account.expiresAt !== undefined &&
    account.expiresAt.getTime() - Date.now() < REFRESH_MARGIN_MS;
  if (!(expiresSoon && account.refreshToken)) {
    return account.token;
  }

  const inFlight = refreshes.get(userId);
  if (inFlight) {
    return inFlight;
  }
  const started = refreshAccount({
    account,
    spent: account.refreshToken,
    userId,
  }).finally(() => refreshes.delete(userId));
  refreshes.set(userId, started);
  return started;
}

const patUserSchema = z.object({ login: z.string() });

export async function verifyGitHubPat(
  token: string
): Promise<
  { login: string; scopes: string[]; token: string } | { error: string }
> {
  const body = await githubApi({ path: '/user', token });
  if ('error' in body) {
    return { error: 'GitHub rejected that token.' };
  }
  const login = patUserSchema.safeParse(body.data).data?.login;
  if (!login) {
    return { error: 'GitHub returned an account this could not read.' };
  }
  if (body.scopes.length === 0) {
    return {
      error:
        'That looks like a fine-grained token. Those only reach your own repositories, which the GitHub App already covers. Use a classic token with `public_repo`.',
    };
  }
  return { login, scopes: body.scopes, token };
}
