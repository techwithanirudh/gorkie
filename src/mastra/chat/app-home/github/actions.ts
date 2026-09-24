import { Chat } from 'chat';
import { removeGitHubCredential } from '../../../db/queries/github';
import {
  clearGitHubSettings,
  getGitHubSettings,
  setGitHubSettings,
} from '../../../db/queries/settings';
import { githubAccessToken, revokeGitHubGrant } from '../../../lib/github';
import { logger } from '../../../lib/logger';
import { githubPermissionSchema } from '../../../types';
import { scopeSchema } from '../presets';
import { publishHome, refreshHome } from '../view';
import { ids } from './ids';
import { configureModal } from './views';

export function registerGitHub(): void {
  const bot = Chat.getSingleton();

  // Connect is a link button; Slack still sends its click, which needs no work.
  bot.onAction(ids.connect, () => undefined);

  bot.onAction(ids.configure, async (event) => {
    await event.openModal(
      configureModal(await getGitHubSettings(event.user.userId))
    );
  });

  bot.onModalSubmit(ids.configureModal, async (event) => {
    await setGitHubSettings({
      permission: githubPermissionSchema.parse(event.values[ids.permission]),
      threads: scopeSchema.parse(event.values[ids.scope]) === 'threads',
      userId: event.user.userId,
    });
    refreshHome(event.user.userId);
  });

  bot.onAction(ids.disconnect, async (event) => {
    // GitHub only revokes a grant with a live token.
    const token = await githubAccessToken(event.user.userId).catch(
      (error: unknown) => {
        logger.warn('[github] could not refresh before revoking', {
          error,
          userId: event.user.userId,
        });
      }
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
