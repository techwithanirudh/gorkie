import {
  MCPOAuthClientProvider,
  type OAuthClientProvider,
  type OAuthStorage,
  type OAuthTokens,
  refreshAuthorization,
} from '@mastra/mcp';
import * as oauth from 'oauth4webapi';
import { z } from 'zod';
import { mcp as mcpConfig } from '../config';
import {
  clearMCPOAuth,
  mcpOAuthStorage,
  setMCPOAuthStatus,
} from '../db/queries/mcp-oauth';
import { logger } from '../lib/logger';
import type { MCPServerConfig } from '../types';
import { guardedFetch } from './security';

type DiscoveryState = Parameters<
  NonNullable<OAuthClientProvider['saveDiscoveryState']>
>[0];

const refreshing = new Map<string, Promise<void>>();

const discoverySchema = z.looseObject({
  authorizationServerUrl: z.string(),
  authorizationServerMetadata: z
    .looseObject({
      issuer: z.string(),
      registration_endpoint: z.string().optional(),
      revocation_endpoint: z.string().optional(),
      token_endpoint: z.string(),
    })
    .optional(),
});

const clientSchema = z.looseObject({
  client_id: z.string(),
  client_secret: z.string().optional(),
  redirect_uris: z.array(z.string()).optional(),
});

// Mastra's provider keeps tokens, client info and the PKCE verifier; this adds
// what the MCP SDK needs to bind the callback to the authorization server that
// issued it (discovery state) and what a proactive refresh needs.
export class MCPServerOAuth extends MCPOAuthClientProvider {
  readonly #onRedirect?: (url: URL) => void;
  readonly #server: MCPServerConfig;
  readonly #store: OAuthStorage;
  readonly #userId: string;

  constructor({
    onRedirect,
    redirectUri,
    server,
    state,
    userId,
  }: {
    onRedirect?: (url: URL) => void;
    redirectUri: string;
    server: MCPServerConfig;
    state?: string;
    userId: string;
  }) {
    const store = mcpOAuthStorage({ name: server.name, userId });
    super({
      redirectUrl: redirectUri,
      clientMetadata: {
        client_name: 'Gorkie',
        grant_types: ['authorization_code', 'refresh_token'],
        redirect_uris: [redirectUri],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      },
      storage: store,
      ...(state ? { stateGenerator: () => state } : {}),
    });
    this.#onRedirect = onRedirect;
    this.#server = server;
    this.#store = store;
    this.#userId = userId;
  }

  async saveDiscoveryState(state: DiscoveryState): Promise<void> {
    await this.#store.set('discovery', JSON.stringify(state));
  }

  async discoveryState(): Promise<DiscoveryState | undefined> {
    const stored = await this.#store.get('discovery');
    // TODO(slopradar): CODING_STANDARDS: Zod at boundaries | JSON.parse returns `any` from a DB row and flows out typed as DiscoveryState unchecked (it later feeds refreshAuthorization) | parse with discoverySchema (widened to match DiscoveryState) like mcpOAuthHosts does
    return stored ? JSON.parse(stored) : undefined;
  }

  async saveResourceUrl(resourceUrl: string): Promise<void> {
    await this.#store.set('resource', resourceUrl);
  }

  async resourceUrl(): Promise<string | undefined> {
    return await this.#store.get('resource');
  }

  override async invalidateCredentials(
    scope: 'all' | 'client' | 'discovery' | 'tokens' | 'verifier'
  ): Promise<void> {
    if (scope === 'all' || scope === 'discovery') {
      await this.#store.delete('discovery');
      await this.#store.delete('resource');
    }
    if (scope !== 'discovery') {
      await super.invalidateCredentials(scope);
    }
  }

  override async saveTokens(tokens: OAuthTokens): Promise<void> {
    await super.saveTokens(tokens);
    await this.#store.set('tokens_saved_at', String(Date.now()));
  }

  // Refresh tokens can be single-use, so concurrent 401 refreshes would burn
  // each other. Refreshing just before expiry, once per server, avoids that.
  override async tokens(): Promise<OAuthTokens | undefined> {
    const tokens = await super.tokens();
    const savedAt = Number(await this.#store.get('tokens_saved_at'));
    // TODO(slopradar): CODING_STANDARDS: small functions, early returns | one negated compound condition mixes the mode check (an absent #onRedirect silently means "background turn"), token presence and expiry maths, which is hard to verify | split into guard clauses: `if (this.#onRedirect) return tokens;`, then missing refresh_token/savedAt/expires_in, then the remaining-time check
    if (
      !(this.#onRedirect === undefined && tokens?.refresh_token && savedAt) ||
      tokens.expires_in === undefined ||
      savedAt + tokens.expires_in * 1000 - Date.now() >
        mcpConfig.refreshBeforeExpiryMs
    ) {
      return tokens;
    }
    const key = `${this.#userId}:${this.#server.name}`;
    let pending = refreshing.get(key);
    if (!pending) {
      pending = this.#refresh(tokens.refresh_token).finally(() =>
        refreshing.delete(key)
      );
      refreshing.set(key, pending);
    }
    await pending.catch((error: unknown) =>
      logger.debug('[mcp] proactive token refresh failed', {
        error: error instanceof Error ? error.name : 'unknown',
        name: this.#server.name,
        userId: this.#userId,
      })
    );
    return await super.tokens();
  }

  override async redirectToAuthorization(url: URL): Promise<void> {
    if (this.#onRedirect) {
      this.#onRedirect(url);
      return;
    }
    await setMCPOAuthStatus({
      error:
        'Sign-in expired or was revoked. Press Reconnect on this server in the Home tab.',
      name: this.#server.name,
      status: 'needs-auth',
      userId: this.#userId,
    });
  }

  async #refresh(refreshToken: string): Promise<void> {
    const [discovery, client, resource] = await Promise.all([
      this.discoveryState(),
      this.clientInformation(),
      this.resourceUrl(),
    ]);
    if (!(discovery && client)) {
      return;
    }
    // Saved without an issuer stamp; the SDK re-stamps it on its next auth().
    await this.saveTokens(
      await refreshAuthorization(discovery.authorizationServerUrl, {
        clientInformation: client,
        fetchFn: guardedFetch,
        refreshToken,
        ...(discovery.authorizationServerMetadata
          ? { metadata: discovery.authorizationServerMetadata }
          : {}),
        ...(resource ? { resource: new URL(resource) } : {}),
      })
    );
  }
}

export async function mcpOAuthHosts({
  name,
  userId,
}: {
  name: string;
  userId: string;
}): Promise<string[]> {
  const stored = await mcpOAuthStorage({ name, userId }).get('discovery');
  // TODO(slopradar): review: correctness + simplification: duplication | `raw ? JSON.parse(raw) : undefined` then safeParse is repeated 4 times in this file, and here JSON.parse (and `new URL(url)` below) is outside any try, so one corrupt row throws out of buildClient's Promise.all and drops every MCP server for the user | one shared stored-JSON read (e.g. a `z.string().transform` with safe JSON parse, or a typed getter on mcpOAuthStorage) that returns undefined on bad data
  const discovery = discoverySchema.safeParse(
    stored ? JSON.parse(stored) : undefined
  ).data;
  if (!discovery) {
    return [];
  }
  const metadata = discovery.authorizationServerMetadata;
  return [
    ...new Set(
      [
        discovery.authorizationServerUrl,
        metadata?.token_endpoint,
        metadata?.registration_endpoint,
      ]
        .filter((url): url is string => Boolean(url))
        .map((url) => new URL(url).host)
    ),
  ];
}

export async function revokeMCPOAuth({
  name,
  userId,
}: {
  name: string;
  userId: string;
}): Promise<void> {
  const store = mcpOAuthStorage({ name, userId });
  try {
    const [rawDiscovery, rawClient, rawTokens] = await Promise.all([
      store.get('discovery'),
      store.get('client_info'),
      store.get('tokens'),
    ]);
    const metadata = discoverySchema.safeParse(
      rawDiscovery ? JSON.parse(rawDiscovery) : undefined
    ).data?.authorizationServerMetadata;
    const client = clientSchema.safeParse(
      rawClient ? JSON.parse(rawClient) : undefined
    ).data;
    const tokens = z
      .looseObject({
        access_token: z.string(),
        refresh_token: z.string().optional(),
      })
      .safeParse(rawTokens ? JSON.parse(rawTokens) : undefined).data;
    if (!(metadata?.revocation_endpoint && client && tokens)) {
      return;
    }
    const auth = client.client_secret
      ? oauth.ClientSecretPost(client.client_secret)
      : oauth.None();
    for (const token of [tokens.refresh_token, tokens.access_token]) {
      if (!token) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: refresh first, so a failed access revocation still leaves nothing that can mint more.
      await oauth.processRevocationResponse(
        await oauth.revocationRequest(
          {
            issuer: metadata.issuer,
            revocation_endpoint: metadata.revocation_endpoint,
          },
          { client_id: client.client_id },
          auth,
          token,
          {
            [oauth.customFetch]: guardedFetch,
          }
        )
      );
    }
  } catch (error) {
    logger.debug('[mcp] token revocation failed', {
      error: error instanceof Error ? error.name : 'unknown',
      name,
      userId,
    });
  } finally {
    await clearMCPOAuth({ name, userId });
  }
}

export function registeredRedirects(raw: unknown): string[] {
  return clientSchema.safeParse(raw).data?.redirect_uris ?? [];
}
