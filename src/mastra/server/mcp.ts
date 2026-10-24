import { auth } from '@mastra/mcp';
import { refreshHome } from '../chat/app-home/view';
import { setMCPOAuthStatus } from '../db/queries/mcp-oauth';
import { getMCPServer } from '../db/queries/mcps';
import { MCPServerOAuth, registeredRedirects } from '../mcp/oauth';
import { guardedFetch } from '../mcp/security';
import { dropClient } from '../mcp/user-servers/client';
import type { OAuthProviderHandler, OAuthToken } from '../types';

async function ownedServer(token: OAuthToken) {
  const server = token.target
    ? await getMCPServer({ name: token.target, userId: token.slackUserId })
    : undefined;
  if (!server) {
    throw new Error('MCP server not found for this sign-in');
  }
  return server;
}

export const mcpOAuth: OAuthProviderHandler = {
  authorizeUrl: async ({ redirectUri, state, token }) => {
    const server = await ownedServer(token);
    let authorizationUrl: URL | undefined;
    const provider = new MCPServerOAuth({
      onRedirect: (url) => {
        authorizationUrl = url;
      },
      redirectUri,
      server,
      state,
      userId: token.slackUserId,
    });
    // A registration made for another base URL cannot complete this redirect,
    // and fresh discovery records the issuer the callback is checked against.
    const client = await provider.clientInformation();
    if (client && !registeredRedirects(client).includes(redirectUri)) {
      await provider.invalidateCredentials('client');
    }
    await provider.invalidateCredentials('verifier');
    await provider.invalidateCredentials('discovery');
    await auth(provider, {
      fetchFn: guardedFetch,
      forceReauthorization: true,
      serverUrl: server.url,
    });
    if (authorizationUrl?.protocol !== 'https:') {
      throw new Error(
        'Authorization server did not return an https sign-in URL'
      );
    }
    if (!server.oauth) {
      await setMCPOAuthStatus({
        name: server.name,
        status: 'disconnected',
        userId: token.slackUserId,
      });
    }
    return authorizationUrl.toString();
  },

  complete: async ({ query, redirectUri, token }) => {
    const server = await ownedServer(token);
    if (query.error || !query.code) {
      return {
        page: {
          tone: 'error',
          title: `${server.name} not connected`,
          text: `${server.name} did not grant access, so nothing changed.`,
        },
      };
    }
    const provider = new MCPServerOAuth({
      redirectUri,
      server,
      userId: token.slackUserId,
    });
    await auth(provider, {
      authorizationCode: query.code,
      fetchFn: guardedFetch,
      serverUrl: server.url,
      ...(query.iss ? { iss: query.iss } : {}),
    });
    await provider.invalidateCredentials('verifier');
    await setMCPOAuthStatus({
      error: null,
      name: server.name,
      status: 'connected',
      userId: token.slackUserId,
    });
    await dropClient(token.slackUserId);
    refreshHome(token.slackUserId);
    return {
      page: {
        tone: 'success',
        title: `${server.name} connected`,
        text: `Connected to ${server.name}. You can close this tab and go back to Slack.`,
      },
    };
  },
};
