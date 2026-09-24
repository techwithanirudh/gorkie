import { timingSafeEqual } from 'node:crypto';
import { registerApiRoute } from '@mastra/core/server';
import { Chat } from 'chat';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { env } from '@/env';
import { optInStatus } from '../chat/allowed-users';
import { slack } from '../chat/client';
import { signOAuthToken, verifyOAuthToken } from '../lib/crypto';
import { logger } from '../lib/logger';
import {
  type OAuthProvider,
  type OAuthProviderHandler,
  oauthProviderSchema,
} from '../types';
import { githubOAuth } from './github';
import { mcpOAuth } from './mcp';
import { oauthRedirectUri } from './oauth-link';
import { oauthPage, privateHeaders } from './page';

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

function providerNotFound(c: Context): Promise<Response> {
  return oauthPage({
    c,
    status: 404,
    title: 'Not found',
    paragraphs: ['This sign-in link is not available.'],
  });
}

async function verifiedStart({
  c,
  consume,
  ticket,
}: {
  c: Context;
  consume: boolean;
  ticket?: string;
}) {
  const provider = oauthProviderSchema.safeParse(c.req.param('provider')).data;
  const handler = provider ? providers[provider] : undefined;
  const token = verifyOAuthToken({ purpose: 'start', signed: ticket });
  if (!(provider && handler)) {
    return { response: await providerNotFound(c) };
  }
  const state = Chat.getSingleton().getState();
  if (
    !token ||
    token.provider !== provider ||
    (await optInStatus(token.slackUserId)) !== 'allowed' ||
    (consume
      ? !(await state.setIfNotExists(
          `oauth-start:${token.nonce}`,
          true,
          600_000
        ))
      : (await state.get(`oauth-start:${token.nonce}`)) !== null)
  ) {
    return {
      response: await oauthPage({
        c,
        status: 400,
        title: 'Link expired',
        paragraphs: [
          'This sign-in link expired or was already used. Open the Gorkie Home tab in Slack and start again.',
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
          const started = await verifiedStart({ c, consume: false, ticket });
          if ('response' in started) {
            return started.response;
          }
          const { slackUserId } = started.token;
          // The handle and id, not only the display name, which anyone can set
          // to match someone else's. A failed lookup still shows the id.
          const { user } = await slack.webClient.users
            .info({ user: slackUserId })
            .catch(() => ({ user: undefined }));
          const name = user?.profile?.display_name || user?.real_name;
          const handle = user?.name ? `@${user.name} ` : '';
          const who = `${name ? `${name}, ` : ''}${handle}(${slackUserId})`;
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
            consume: true,
            ticket: typeof form.t === 'string' ? form.t : undefined,
          });
          if ('response' in started) {
            return started.response;
          }
          const redirectUri = oauthRedirectUri(started.provider);
          if (!redirectUri) {
            return providerNotFound(c);
          }
          const { nonce, signed: state } = signOAuthToken({
            ...started.token,
            purpose: 'state',
          });
          try {
            const location = await started.handler.authorizeUrl({
              redirectUri,
              state,
              token: started.token,
            });
            setCookie(c, cookie.name(started.provider), nonce, cookie.options);
            privateHeaders(c);
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
          const redirectUri = provider ? oauthRedirectUri(provider) : undefined;
          if (!(provider && handler && redirectUri)) {
            return providerNotFound(c);
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
              redirectUri,
              token,
            });
            if ('redirect' in outcome) {
              privateHeaders(c);
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
