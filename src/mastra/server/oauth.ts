import { timingSafeEqual } from 'node:crypto';
import { registerApiRoute } from '@mastra/core/server';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { env } from '@/env';
import { resolveUserProfile } from '../chat/names';
import { isUserAllowed } from '../lib/allowed-users';
import { signOAuthToken, verifyOAuthToken } from '../lib/crypto';
import { logger } from '../lib/logger';
import {
  type OAuthProvider,
  type OAuthProviderHandler,
  oauthProviderSchema,
} from '../types';
import { githubOAuth } from './github';
import { mcpOAuth } from './mcp';
import { oauthPage } from './page';

const providers: Record<OAuthProvider, OAuthProviderHandler> = {
  github: githubOAuth,
  mcp: mcpOAuth,
};

const cookie = {
  name: (provider: OAuthProvider) => `gorkie_oauth_${provider}`,
  options: {
    httpOnly: true,
    maxAge: 600,
    path: '/oauth',
    sameSite: 'Lax',
    secure: true,
  },
} as const;

const redirectUri = (provider: OAuthProvider) =>
  `${env.PUBLIC_BASE_URL}/oauth/${provider}/callback`;

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

async function verifiedStart({ c, ticket }: { c: Context; ticket?: string }) {
  const provider = oauthProviderSchema.safeParse(c.req.param('provider')).data;
  const handler = provider ? providers[provider] : undefined;
  const token = verifyOAuthToken({ purpose: 'start', signed: ticket });
  if (!(provider && handler)) {
    return {
      response: await oauthPage({
        c,
        status: 404,
        title: 'Not found',
        paragraphs: ['This sign-in link is not available.'],
      }),
    };
  }
  if (
    !token ||
    token.provider !== provider ||
    !(await isUserAllowed(token.slackUserId))
  ) {
    return {
      response: await oauthPage({
        c,
        status: 400,
        title: 'Link expired',
        paragraphs: [
          'This sign-in link is no longer valid. Open the Gorkie Home tab in Slack and start again.',
        ],
      }),
    };
  }
  return { handler, provider, token };
}

export const oauthRoutes = env.PUBLIC_BASE_URL
  ? [
      registerApiRoute('/oauth/:provider/start', {
        method: 'GET',
        requiresAuth: false,
        handler: async (c) => {
          const ticket = c.req.query('t') ?? '';
          const started = await verifiedStart({ c, ticket });
          if ('response' in started) {
            return started.response;
          }
          const profile = await resolveUserProfile(
            started.token.slackUserId
          ).catch(() => undefined);
          const who =
            profile?.displayName ??
            profile?.realName ??
            started.token.slackUserId;
          const target = started.token.target
            ? ` (${started.token.target})`
            : '';
          return oauthPage({
            c,
            title: `Connect ${started.provider}${target} to Gorkie`,
            paragraphs: [
              `This connects your ${started.provider} account to the Slack user ${who}. Continue only if that is you.`,
            ],
            form: { action: c.req.path, ticket },
          });
        },
      }),
      registerApiRoute('/oauth/:provider/start', {
        method: 'POST',
        requiresAuth: false,
        handler: async (c) => {
          const form = await c.req.parseBody();
          const started = await verifiedStart({
            c,
            ticket: typeof form.t === 'string' ? form.t : undefined,
          });
          if ('response' in started) {
            return started.response;
          }
          const { nonce, signed: state } = signOAuthToken({
            ...started.token,
            purpose: 'state',
          });
          try {
            const location = await started.handler.authorizeUrl({
              redirectUri: redirectUri(started.provider),
              state,
              token: started.token,
            });
            setCookie(c, cookie.name(started.provider), nonce, cookie.options);
            c.header('Cache-Control', 'no-store');
            c.header('Referrer-Policy', 'no-referrer');
            return c.redirect(location, 303);
          } catch (error) {
            logger.warn('[oauth] could not start sign-in', {
              error: error instanceof Error ? error.name : 'unknown',
              provider: started.provider,
              userId: started.token.slackUserId,
            });
            return oauthPage({
              c,
              status: 502,
              title: 'Could not start sign-in',
              paragraphs: [
                'The provider could not be reached. Try again from the Home tab in a minute.',
              ],
            });
          }
        },
      }),
      registerApiRoute('/oauth/:provider/callback', {
        method: 'GET',
        requiresAuth: false,
        handler: async (c) => {
          const provider = oauthProviderSchema.safeParse(
            c.req.param('provider')
          ).data;
          const handler = provider ? providers[provider] : undefined;
          if (!(provider && handler)) {
            return oauthPage({
              c,
              status: 404,
              title: 'Not found',
              paragraphs: ['This sign-in link is not available.'],
            });
          }
          const token = verifyOAuthToken({
            purpose: 'state',
            signed: c.req.query('state'),
          });
          const bound = Buffer.from(getCookie(c, cookie.name(provider)) ?? '');
          deleteCookie(c, cookie.name(provider), cookie.options);
          const expected = Buffer.from(token?.nonce ?? '');
          if (
            !token ||
            token.provider !== provider ||
            bound.length === 0 ||
            bound.length !== expected.length ||
            !timingSafeEqual(bound, expected)
          ) {
            return oauthPage({
              c,
              status: 400,
              title: 'Sign-in not finished',
              paragraphs: [
                'This sign-in was started in another browser, expired, or was already used. Start again from the Home tab in Slack.',
              ],
            });
          }
          try {
            const outcome = await handler.complete({
              query: c.req.query(),
              redirectUri: redirectUri(provider),
              token,
            });
            if ('redirect' in outcome) {
              c.header('Cache-Control', 'no-store');
              c.header('Referrer-Policy', 'no-referrer');
              return c.redirect(outcome.redirect, 303);
            }
            return oauthPage({ c, ...outcome.page });
          } catch (error) {
            // Only the error name: OAuth client errors can carry the client
            // secret, the code, or the token in their message and request.
            logger.warn('[oauth] callback failed', {
              error: error instanceof Error ? error.name : 'unknown',
              provider,
              userId: token.slackUserId,
            });
            return oauthPage({
              c,
              status: 502,
              title: 'Sign-in failed',
              paragraphs: [
                'Something went wrong finishing the sign-in. Start again from the Home tab in Slack.',
              ],
            });
          }
        },
      }),
      registerApiRoute('/oauth/github/installed', {
        method: 'GET',
        requiresAuth: false,
        handler: (c) =>
          oauthPage({
            c,
            title: 'GitHub updated',
            paragraphs: [
              'Gorkie now sees the repositories you picked. If an organization owner still has to approve the install, access starts once they do. Open the Gorkie Home tab in Slack to check.',
            ],
          }),
      }),
    ]
  : [];
