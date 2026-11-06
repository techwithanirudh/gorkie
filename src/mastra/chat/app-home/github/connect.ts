import {
  getGitHubCredential,
  setGitHubCredential,
} from '../../../db/queries/github';
import {
  awaitDeviceLogin,
  type DeviceLogin,
  githubUser,
  startDeviceLogin,
} from '../../../lib/github';
import { logger } from '../../../lib/logger';
import { slack } from '../../client';
import { chat } from '../../instance';
import { guarded } from '../../moderation/gate';
import { ids } from './ids';
import {
  connectedModal,
  connectView,
  failedModal,
  pendingModal,
} from './views';

export const polling = new Map<
  string,
  {
    controller: AbortController;
    device: DeviceLogin;
    viewId: string | undefined;
  }
>();

export async function completeLogin({
  controller,
  login,
  userId,
}: {
  controller: AbortController;
  login: Awaited<ReturnType<typeof awaitDeviceLogin>>;
  userId: string;
}): Promise<string | undefined> {
  if ('error' in login) {
    logger.info('[github] device login did not complete', {
      reason: login.error,
      userId,
    });
    return;
  }
  const resolved = await githubUser(login.token);
  if ('error' in resolved) {
    logger.warn('[github] authorized but could not read the account', {
      error: resolved.error,
      userId,
    });
    return;
  }
  // Disconnect or a newer sign-in may have claimed the slot while GitHub answered.
  if (polling.get(userId)?.controller !== controller) {
    return;
  }
  await setGitHubCredential({
    credential: { ...login, login: resolved.login },
    userId,
  });
  return resolved.login;
}

type PublishHome = (userId: string) => Promise<void>;

async function settleLogin({
  controller,
  login,
  publishHome,
  userId,
}: {
  controller: AbortController;
  login: Awaited<ReturnType<typeof awaitDeviceLogin>>;
  publishHome: PublishHome;
  userId: string;
}): Promise<void> {
  const current = polling.get(userId);
  if (current?.controller !== controller) {
    return;
  }
  const resolved = await completeLogin({ controller, login, userId });
  if (polling.get(userId)?.controller === controller) {
    polling.delete(userId);
  }
  await publishHome(userId);
  if (!current.viewId) {
    return;
  }
  try {
    await slack.updateModal(
      current.viewId,
      resolved
        ? connectedModal(resolved)
        : failedModal('error' in login ? login.error : 'unknown')
    );
  } catch (error) {
    logger.debug('[github] could not update the sign-in modal', {
      error,
      userId,
    });
  }
}

async function openConnect({
  publishHome,
  triggerId,
  userId,
}: {
  publishHome: PublishHome;
  triggerId: string;
  userId: string;
}): Promise<void> {
  let device: DeviceLogin;
  try {
    device = await startDeviceLogin();
  } catch (error) {
    logger.error('[github] could not start device login', { error, userId });
    return;
  }

  polling.get(userId)?.controller.abort();
  const controller = new AbortController();
  polling.set(userId, { controller, device, viewId: undefined });
  let opened: Awaited<ReturnType<typeof slack.webClient.views.open>>;
  try {
    opened = await slack.webClient.views.open({
      trigger_id: triggerId,
      view: connectView({ device }),
    });
  } catch (error) {
    logger.error('[github] could not open the connect modal', {
      error,
      userId,
    });
    if (polling.get(userId)?.controller === controller) {
      polling.delete(userId);
    }
    return;
  }
  const current = polling.get(userId);
  if (current?.controller === controller) {
    polling.set(userId, { ...current, viewId: opened.view?.id });
  }

  awaitDeviceLogin({ ...device, signal: controller.signal })
    .then((login) => settleLogin({ controller, login, publishHome, userId }))
    .catch((error: unknown) =>
      logger.error('[github] device login failed', { error, userId })
    );
}

async function finishDeviceLogin(userId: string) {
  const pending = polling.get(userId);
  if (pending?.device) {
    return { action: 'update' as const, modal: pendingModal(pending.device) };
  }
  if (await getGitHubCredential(userId)) {
    return { action: 'clear' as const };
  }
  return { action: 'update' as const, modal: failedModal('interrupted') };
}

export function registerConnect({
  publishHome,
}: {
  publishHome: PublishHome;
}): void {
  const bot = chat();

  bot.onAction(
    ids.connect,
    guarded((event) =>
      openConnect({
        publishHome,
        triggerId: event.triggerId ?? '',
        userId: event.user.userId,
      })
    )
  );

  bot.onModalSubmit(
    ids.modal,
    guarded((event) => finishDeviceLogin(event.user.userId))
  );
}
