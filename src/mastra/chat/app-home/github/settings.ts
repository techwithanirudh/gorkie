import { Chat } from 'chat';
import { removeGitHubCredential } from '../../../db/queries/github';
import {
  clearGitHubPermission,
  getGitHubPermission,
  setGitHubPermission,
} from '../../../db/queries/settings';
import { githubAccessToken, revokeGitHubGrant } from '../../../lib/github';
import { githubPermissionSchema, type PublishHome } from '../../../types';
import { ids } from './ids';
import { configureModal } from './views';

export function registerSettings({
  publishHome,
}: {
  publishHome: PublishHome;
}): void {
  const bot = Chat.getSingleton();

  bot.onAction(ids.configure, async (event) => {
    await event.openModal(
      configureModal(await getGitHubPermission(event.user.userId))
    );
  });

  bot.onModalSubmit(ids.configureModal, async (event) => {
    await setGitHubPermission({
      permission: githubPermissionSchema.parse(event.values[ids.permission]),
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
    await clearGitHubPermission(event.user.userId);
    await publishHome(event.user.userId);
  });
}
