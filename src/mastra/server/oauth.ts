import { timingSafeEqual } from 'node:crypto';
import { registerApiRoute } from '@mastra/core/server';
import { Chat } from 'chat';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { env } from '@/env';
import { optInStatus } from '../chat/allowed-users';
import { publishHome } from '../chat/app-home/view';
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
    // TODO(slopradar): duplicated tunable : the link lifetime is 600 s here, 600_000 ms at the nonce TTL below and Factory's fixed 10 minutes
    // → one config.oauth.linkTtlMs feeding both.
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
    tone: 'error',
    title: 'Link not found',
    text: 'This sign-in link does not exist. Start again from the Gorkie Home tab in Slack.',
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
  // TODO(slopradar): security S9 : the Chat state adapter is in-process memory (chat/state.ts:9), so a used start link replays after a restart
  // → record the nonce in Postgres (Mastra threadState domain or a small table).
  const state = Chat.getSingleton().getState();
  // TODO(slopradar): readability : one condition mixes four checks, two awaits and a consume/peek ternary
  // → early returns per check, then a named `fresh` boolean for the nonce step.
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
        tone: 'expired',
        title: 'Link expired',
        text: 'This sign-in link expired or was already used. Start again from the Gorkie Home tab in Slack.',
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
          // TODO(slopradar): dead check : oauthRoutes exist only when PUBLIC_BASE_URL is set, so oauthRedirectUri cannot be undefined here (also the callback route)
          // → build the URI from env.PUBLIC_BASE_URL inside the routes and drop the branch.
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
        handler: async (c) => {
          // GitHub hands back the state put on the install link, the only way
          // to know whose Home tab to refresh. A stale or missing one still
          // gets the page; the Home tab then updates on its next open.
          const token = verifyOAuthToken({
            purpose: 'install',
            signed: c.req.query('state'),
          });
          if (token?.provider === 'github') {
            await publishHome(token.slackUserId).catch((error: unknown) =>
              logger.warn('[github] could not refresh the Home tab', {
                error,
                userId: token.slackUserId,
              })
            );
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
