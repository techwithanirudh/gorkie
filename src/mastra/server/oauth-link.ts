import { env } from '@/env';
import { github as githubConfig } from '../config';
import { signOAuthToken } from '../lib/crypto';
import type { OAuthProvider } from '../types';

export function oauthStartLink({
  provider,
  slackUserId,
  target,
}: {
  provider: OAuthProvider;
  slackUserId: string;
  target?: string;
}): string | undefined {
  if (!env.PUBLIC_BASE_URL) {
    return;
  }
  const { signed } = signOAuthToken({
    provider,
    purpose: 'start',
    slackUserId,
    ...(target ? { target } : {}),
  });
  return `${env.PUBLIC_BASE_URL}/oauth/${provider}/start?t=${signed}`;
}

export function oauthRedirectUri(provider: OAuthProvider): string | undefined {
  if (!env.PUBLIC_BASE_URL) {
    return;
  }
  return `${env.PUBLIC_BASE_URL}/oauth/${provider}/callback`;
}

export function githubInstallLink(slackUserId: string): string {
  const { signed } = signOAuthToken({
    provider: 'github',
    purpose: 'install',
    slackUserId,
  });
  return `${githubConfig.installUrl}?state=${encodeURIComponent(signed)}`;
}
