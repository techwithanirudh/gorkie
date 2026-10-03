import { timingSafeEqual } from 'node:crypto';
import { registerApiRoute } from '@mastra/core/server';
import { Chat } from 'chat';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { env } from '@/env';
import { optInStatus } from '../chat/allowed-users';
import { refreshHome } from '../chat/app-home/view';
import { slack } from '../chat/client';
import { oauth } from '../config';
import { signOAuthToken, verifyOAuthToken } from '../lib/crypto';
import { logger } from '../lib/logger';
import {
  type OAuthProvider,
  type OAuthProviderHandler,
  oauthProviderSchema,
} from '../types';
import { githubOAuth } from './github';
import { mcpOAuth } from './mcp';
import { oauthCallbackUri } from './oauth-link';
import { oauthPage, privateHeaders } from './page';

const publicBaseUrl = env.PUBLIC_BASE_URL;
const publicOrigin = publicBaseUrl ? new URL(publicBaseUrl).origin : undefined;

const providers: Record<OAuthProvider, OAuthProviderHandler> = {
  github: githubOAuth,
  mcp: mcpOAuth,
};

const cookie = {
  name: (provider: OAuthProvider) => `gorkie_oauth_${provider}`,
  options: {
    httpOnly: true,
    maxAge: oauth.linkTtlMs / 1000,
    path: '/oauth',
    sameSite: 'Lax',
    secure: true,
  },
} as const;

function providerNotFound(c: Context): Promise<Response> {
  return oauthPage({
    c,
    status: 404,
    tone: 'error',
    title: 'Link not found',
    text: 'This sign-in link does not exist. Start again from the Gorkie Home tab in Slack.',
  });
}

function linkExpired(c: Context): Promise<Response> {
  return oauthPage({
    c,
    status: 400,
    tone: 'expired',
    title: 'Link expired',
    text: 'This sign-in link expired or was already used. Start again from the Gorkie Home tab in Slack.',
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
  if (!provider) {
    return { response: await providerNotFound(c) };
  }
  const token = verifyOAuthToken({ purpose: 'start', signed: ticket });
  if (!token || token.provider !== provider) {
    return { response: await linkExpired(c) };
  }
  if ((await optInStatus(token.slackUserId)) !== 'allowed') {
    return { response: await linkExpired(c) };
  }
  const state = Chat.getSingleton().getState();
  const key = `oauth-start:${token.nonce}`;
  const fresh = consume
    ? await state.setIfNotExists(key, true, oauth.linkTtlMs)
    : (await state.get(key)) === null;
  if (!fresh) {
    return { response: await linkExpired(c) };
  }
  return { handler: providers[provider], provider, token };
}

export const oauthRoutes = publicBaseUrl
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
          const service =
            started.provider === 'github'
              ? 'GitHub'
              : (started.token.target ?? 'MCP server');
          return oauthPage({
            c,
            tone: 'connect',
            title: `Connect ${service}`,
            text: `Gorkie will link your ${service} account to this Slack user. Continue only if this is you.`,
            detail: { label: 'Slack user', value: who },
            form: { action: c.req.path, ticket },
          });
        },
      }),
      registerApiRoute('/oauth/:provider/start', {
        method: 'POST',
        requiresAuth: false,
        handler: async (c) => {
          // Login CSRF: another site could auto-submit a stolen ticket and
          // bind its owner's account to this browser. Browsers send Origin on
          // every cross-site POST; Sec-Fetch-Site covers the rare same-origin
          // POST without it.
          const origin = c.req.header('origin');
          if (
            !(origin
              ? origin === publicOrigin
              : c.req.header('sec-fetch-site') === 'same-origin')
          ) {
            return oauthPage({
              c,
              status: 403,
              tone: 'error',
              title: 'Sign-in blocked',
              text: 'This sign-in was not sent from the Gorkie sign-in page. Start again from the Gorkie Home tab in Slack.',
            });
          }
          const form = await c.req.parseBody();
          const started = await verifiedStart({
            c,
            consume: true,
            ticket: typeof form.t === 'string' ? form.t : undefined,
          });
          if ('response' in started) {
            return started.response;
          }
          const redirectUri = oauthCallbackUri({
            baseUrl: publicBaseUrl,
            provider: started.provider,
          });
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
              tone: 'error',
              title: 'Could not start sign-in',
              text: 'The sign-in service could not be reached. Wait a minute, then start again from the Gorkie Home tab in Slack.',
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
          if (!provider) {
            return providerNotFound(c);
          }
          const handler = providers[provider];
          const redirectUri = oauthCallbackUri({
            baseUrl: publicBaseUrl,
            provider,
          });
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
              tone: 'expired',
              title: 'Sign-in not finished',
              text: 'This sign-in expired, was already used, or was started in another browser. Start again from the Gorkie Home tab in Slack.',
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
              tone: 'error',
              title: 'Sign-in failed',
              text: 'Something went wrong finishing the sign-in. Start again from the Gorkie Home tab in Slack.',
            });
          }
        },
      }),
      registerApiRoute('/oauth/github/installed', {
        method: 'GET',
        requiresAuth: false,
        handler: (c) => {
          // GitHub hands back the state put on the install link, the only way
          // to know whose Home tab to refresh. A stale or missing one still
          // gets the page; the Home tab then updates on its next open.
          const token = verifyOAuthToken({
            purpose: 'install',
            signed: c.req.query('state'),
          });
          if (token?.provider === 'github') {
            refreshHome(token.slackUserId);
          }
          return oauthPage({
            c,
            tone: 'success',
            title: 'GitHub updated',
            text: 'Gorkie now sees the repositories you picked. If an organization owner has to approve the install, access starts once they do.',
          });
        },
      }),
    ]
  : [];
