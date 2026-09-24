import { deleteAuthorization, refreshToken } from '@octokit/oauth-methods';
import { z } from 'zod';
import { env } from '@/env';
import {
  getGitHubCredential,
  removeGitHubCredential,
  updateRefreshedGitHubCredential,
} from '../../db/queries/github';
import type { GitHubAccount } from '../../types';
import { logger } from '../logger';

export function toAccount(authentication: {
  expiresAt?: string;
  refreshToken?: string;
  token: string;
}): GitHubAccount {
  return {
    expiresAt: authentication.expiresAt
      ? new Date(authentication.expiresAt)
      : undefined,
    refreshToken: authentication.refreshToken,
    token: authentication.token,
  };
}

const refreshes = new Map<string, Promise<string | undefined>>();

async function refreshAccount({
  spent,
  userId,
}: {
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
    // Update-only: a disconnect that lands mid-refresh must not be resurrected.
    if (
      await updateRefreshedGitHubCredential({ credential: refreshed, userId })
    ) {
      return refreshed.token;
    }
    return (await getGitHubCredential(userId))?.token;
  } catch (error) {
    // Never log `error` directly: an octokit refresh failure carries the
    // client_secret and refresh_token. Pull out only the status and error code.
    const parsed = z
      .object({
        status: z.number().optional(),
        response: z
          .object({
            data: z.object({ error: z.string().optional() }).optional(),
          })
          .optional(),
      })
      .safeParse(error).data;
    const code = parsed?.response?.data?.error;
    logger.warn('[github] token refresh failed', {
      userId,
      status: parsed?.status,
      code,
    });
    const current = await getGitHubCredential(userId);
    if (current && current.refreshToken !== spent) {
      return current.token;
    }
    // Only this code means the refresh token is dead; a transient failure must not log the user out.
    if (code === 'bad_refresh_token') {
      await removeGitHubCredential(userId);
      return;
    }
    return current?.token;
  }
}

export async function githubAccessToken(
  userId: string
): Promise<string | undefined> {
  const account = await getGitHubCredential(userId);
  if (!account) {
    return;
  }
  const expiresSoon =
    account.expiresAt !== undefined &&
    account.expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  if (!(expiresSoon && account.refreshToken)) {
    return account.token;
  }

  const inFlight = refreshes.get(userId);
  if (inFlight) {
    return inFlight;
  }
  const started = refreshAccount({
    spent: account.refreshToken,
    userId,
  }).finally(() => refreshes.delete(userId));
  refreshes.set(userId, started);
  return started;
}

export async function revokeGitHubGrant(token: string): Promise<void> {
  try {
    await deleteAuthorization({
      clientId: env.GITHUB_APP_CLIENT_ID,
      clientSecret: env.GITHUB_APP_CLIENT_SECRET,
      clientType: 'github-app',
      token,
    });
  } catch (error) {
    // Never log `error` directly: it carries the client_secret and token.
    logger.warn('[github] could not revoke the grant on disconnect', {
      status: z.object({ status: z.number() }).safeParse(error).data?.status,
    });
  }
}
