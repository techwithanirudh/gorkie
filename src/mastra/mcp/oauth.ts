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
import { type MCPServerConfig, storedJson } from '../types';
import { guardedFetch } from './security';

type DiscoveryState = Parameters<
  NonNullable<OAuthClientProvider['saveDiscoveryState']>
>[0];

const refreshing = new Map<string, Promise<void>>();

const discoverySchema = storedJson.pipe(
  z.looseObject({
    authorizationServerUrl: z.url(),
    authorizationServerMetadata: z
      .looseObject({
        authorization_endpoint: z.url(),
        issuer: z.string(),
        registration_endpoint: z.url().optional(),
        response_types_supported: z.array(z.string()),
        revocation_endpoint: z.url().optional(),
        token_endpoint: z.url(),
      })
      .optional(),
    resourceMetadata: z.looseObject({ resource: z.string() }).optional(),
    resourceMetadataUrl: z.string().optional(),
  })
);

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
    return discoverySchema.safeParse(await this.#store.get('discovery')).data;
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
    const inSignInFlow = this.#onRedirect !== undefined;
    if (inSignInFlow) {
      return tokens;
    }
    const savedAt = Number(await this.#store.get('tokens_saved_at'));
    if (
      !(tokens?.refresh_token && savedAt && tokens.expires_in !== undefined)
    ) {
      return tokens;
    }
    if (
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
  const discovery = discoverySchema.safeParse(
    await mcpOAuthStorage({ name, userId }).get('discovery')
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
    const metadata =
      discoverySchema.safeParse(rawDiscovery).data?.authorizationServerMetadata;
    const client = storedJson.pipe(clientSchema).safeParse(rawClient).data;
    const tokens = storedJson
      .pipe(
        z.looseObject({
          access_token: z.string(),
          refresh_token: z.string().optional(),
        })
      )
      .safeParse(rawTokens).data;
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
