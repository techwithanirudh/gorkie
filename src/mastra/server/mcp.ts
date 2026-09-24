import { auth } from '@mastra/mcp';
import { publishHome } from '../chat/app-home/view';
import { setMCPOAuthStatus } from '../db/queries/mcp-oauth';
import { listMCPServers } from '../db/queries/mcps';
import { logger } from '../lib/logger';
import { MCPServerOAuth, registeredRedirects } from '../mcp/oauth';
import { guardedFetch } from '../mcp/security';
import { dropClient } from '../mcp/user-servers/client';
import type { OAuthProviderHandler, OAuthToken } from '../types';

const failed = (text: string) => ({
  page: { title: 'Server not connected', paragraphs: [text] },
});

async function ownedServer(token: OAuthToken) {
  const server = (await listMCPServers(token.slackUserId)).find(
    (entry) => entry.name === token.target
  );
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
      return failed(
        `${server.name} did not grant access. Nothing was changed.`
      );
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
    await publishHome(token.slackUserId).catch((error: unknown) =>
      logger.warn('[mcp] could not refresh the Home tab', {
        error,
        userId: token.slackUserId,
      })
    );
    return {
      page: {
        title: `${server.name} connected`,
        paragraphs: [
          `Gorkie can now use ${server.name} for you. You can close this tab and go back to Slack.`,
        ],
      },
    };
  },
};
