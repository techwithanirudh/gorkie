import {
  exchangeWebFlowCode,
  getWebFlowAuthorizationUrl,
} from '@octokit/oauth-methods';
import { env } from '@/env';
import { refreshHome } from '../chat/app-home/view';
import { setGitHubCredential } from '../db/queries/github';
import { countInstallations, githubUser, toAccount } from '../lib/github';
import type { OAuthPageContent, OAuthProviderHandler } from '../types';
import { githubInstallLink } from './oauth-link';

const failed = (text: string): { page: OAuthPageContent } => ({
  page: { tone: 'error', title: 'GitHub not connected', text },
});

export const githubOAuth: OAuthProviderHandler = {
  authorizeUrl: ({ redirectUri, state }) => {
    const { url } = getWebFlowAuthorizationUrl({
      clientId: env.GITHUB_APP_CLIENT_ID,
      clientType: 'github-app',
      redirectUrl: redirectUri,
      state,
    });
    // Without this, someone already signed in to GitHub is sent straight back
    // with that account and never sees which one is being connected.
    const withPrompt = new URL(url);
    withPrompt.searchParams.set('prompt', 'select_account');
    return Promise.resolve(withPrompt.toString());
  },

  complete: async ({ query, redirectUri, token }) => {
    if (query.error || !query.code) {
      return failed('GitHub did not grant access, so nothing changed.');
    }
    const { authentication } = await exchangeWebFlowCode({
      clientId: env.GITHUB_APP_CLIENT_ID,
      clientSecret: env.GITHUB_APP_CLIENT_SECRET,
      clientType: 'github-app',
      code: query.code,
      redirectUrl: redirectUri,
    });
    const account = toAccount(authentication);
    const user = await githubUser(account.token);
    if ('error' in user) {
      return failed(
        `Signed in, but Gorkie could not read the account: ${user.error}`
      );
    }
    await setGitHubCredential({
      credential: { ...account, login: user.login },
      userId: token.slackUserId,
    });
    refreshHome(token.slackUserId);
    const installations = await countInstallations(account.token);
    if ('count' in installations && installations.count === 0) {
      return { redirect: githubInstallLink(token.slackUserId) };
    }
    return {
      page: {
        tone: 'success',
        title: 'GitHub connected',
        text: `Signed in as ${user.login}. You can close this tab and go back to Slack.`,
      },
    };
  },
};
