import {
  exchangeWebFlowCode,
  getWebFlowAuthorizationUrl,
} from '@octokit/oauth-methods';
import { env } from '@/env';
import { publishHome } from '../chat/app-home/view';
import { setGitHubCredential } from '../db/queries/github';
import { countInstallations, githubUser, toAccount } from '../lib/github';
import { logger } from '../lib/logger';
import type { OAuthProviderHandler } from '../types';

const failed = (text: string) => ({
  page: { title: 'GitHub not connected', paragraphs: [text] },
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
      return failed('GitHub did not grant access. Nothing was changed.');
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
    await publishHome(token.slackUserId).catch((error: unknown) =>
      logger.warn('[github] could not refresh the Home tab', {
        error,
        userId: token.slackUserId,
      })
    );
    if ((await countInstallations(account.token)) === 0) {
      return {
        redirect: `https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`,
      };
    }
    return {
      page: {
        title: 'GitHub connected',
        paragraphs: [
          `Signed in as ${user.login}. Gorkie reaches the repositories you installed it on.`,
        ],
      },
    };
  },
};
