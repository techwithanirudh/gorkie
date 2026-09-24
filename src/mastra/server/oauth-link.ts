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
