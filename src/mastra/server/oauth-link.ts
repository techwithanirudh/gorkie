import { env } from '@/env';
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

// TODO(slopradar): review: correctness | PUBLIC_BASE_URL is optional, so this returns 'undefined/oauth/<provider>/callback' when it is unset; mcp/user-servers/client.ts:99 calls it for any stored OAuth server without checking | return string | undefined like oauthStartLink and have the caller report sign-in as unavailable
export function oauthRedirectUri(provider: OAuthProvider): string {
  return `${env.PUBLIC_BASE_URL}/oauth/${provider}/callback`;
}
