import { Chat } from 'chat';
import { removeGitHubCredential } from '../../../db/queries/github';
import {
  clearGitHubSettings,
  getGitHubSettings,
  setGitHubSettings,
} from '../../../db/queries/settings';
import { githubAccessToken, revokeGitHubGrant } from '../../../lib/github';
import { logger } from '../../../lib/logger';
import { githubPermissionSchema, type PublishHome } from '../../../types';
import { slack } from '../../client';
import { ids } from './ids';
import { configureView, selectedPermission, viewOf } from './views';

export function registerSettings({
  publishHome,
}: {
  publishHome: PublishHome;
}): void {
  const bot = Chat.getSingleton();

  bot.onAction(ids.configure, async (event) => {
    const { userId } = event.user;
    const settings = await getGitHubSettings(userId);
    try {
      await slack.webClient.views.open({
        trigger_id: event.triggerId ?? '',
        view: configureView({
          permission: settings.permission,
          threads: settings.threads,
        }),
      });
    } catch (error) {
      logger.warn('[github] could not open the configure modal', {
        error,
        userId,
      });
    }
  });

  bot.onAction(ids.scope, async (event) => {
    const view = viewOf(event.raw);
    if (!view) {
      return;
    }
    const threads = event.value === 'threads';
    try {
      await slack.webClient.views.update({
        hash: view.hash,
        view_id: view.id,
        view: configureView({
          permission: githubPermissionSchema.parse(
            selectedPermission({
              raw: event.raw,
              renderedScope: threads ? 'dm' : 'threads',
            })
          ),
          threads,
        }),
      });
    } catch (error) {
      logger.warn('[github] could not switch the configure modal', {
        error,
        userId: event.user.userId,
      });
    }
  });

  bot.onModalSubmit(ids.configureModal, async (event) => {
    await setGitHubSettings({
      permission: githubPermissionSchema.parse(event.values[ids.permission]),
      threads: event.values[ids.scope] === 'threads',
      userId: event.user.userId,
    });
    await publishHome(event.user.userId);
  });

  bot.onAction(ids.disconnect, async (event) => {
    // Refreshed first because GitHub only revokes with a live token.
    const token = await githubAccessToken(event.user.userId).catch(
      () => undefined
    );
    await removeGitHubCredential(event.user.userId);
    // Revoking the grant makes the next sign-in show GitHub's consent screen
    // instead of silently reusing the old authorization.
    if (token) {
      await revokeGitHubGrant(token);
    }
    await clearGitHubSettings(event.user.userId);
    await publishHome(event.user.userId);
  });
}
