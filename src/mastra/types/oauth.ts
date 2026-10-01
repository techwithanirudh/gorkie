import { z } from 'zod';

export const oauthProviderSchema = z.enum(['github', 'mcp']);

export type OAuthProvider = z.infer<typeof oauthProviderSchema>;

export const oauthTokenSchema = z.object({
  nonce: z.string().min(1),
  provider: oauthProviderSchema,
  purpose: z.enum(['install', 'start', 'state']),
  slackUserId: z.string().min(1),
  target: z.string().min(1).optional(),
});

export type OAuthToken = z.infer<typeof oauthTokenSchema>;

export interface OAuthPageContent {
  text: string;
  title: string;
  tone: 'connect' | 'error' | 'expired' | 'success';
}

type OAuthOutcome = { redirect: string } | { page: OAuthPageContent };

export interface OAuthProviderHandler {
  authorizeUrl: (options: {
    redirectUri: string;
    state: string;
    token: OAuthToken;
  }) => Promise<string>;
  complete: (options: {
    query: Record<string, string | undefined>;
    redirectUri: string;
    token: OAuthToken;
  }) => Promise<OAuthOutcome>;
}
