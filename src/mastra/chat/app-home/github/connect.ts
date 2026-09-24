import { Chat, type ModalResponse } from 'chat';
import {
  getGitHubCredential,
  setGitHubCredential,
} from '../../../db/queries/github';
import {
  awaitDeviceLogin,
  githubUser,
  startDeviceLogin,
  verifyGitHubPat,
} from '../../../lib/github';
import { logger } from '../../../lib/logger';
import type {
  DeviceLogin,
  DeviceLoginResult,
  GitHubCredentialKind,
  PublishHome,
  ViewTarget,
} from '../../../types';
import { slack } from '../../client';
import { ids } from './ids';
import { connectedModal, connectView, failedModal, viewOf } from './views';

export const polling = new Map<
  string,
  {
    controller: AbortController;
    device: DeviceLogin | undefined;
    method: GitHubCredentialKind;
    viewId: string | undefined;
  }
>();

const isCurrentLogin = ({
  controller,
  userId,
}: {
  controller: AbortController;
  userId: string;
}) => polling.get(userId)?.controller === controller;

async function completeLogin({
  controller,
  login,
  userId,
}: {
  controller: AbortController;
  login: DeviceLoginResult;
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
  if (!isCurrentLogin({ controller, userId })) {
    return;
  }
  await setGitHubCredential({
    credential: { ...login, kind: 'app', login: resolved.login, scopes: [] },
    userId,
  });
  return resolved.login;
}

async function settleLogin({
  controller,
  login,
  publishHome,
  userId,
}: {
  controller: AbortController;
  login: DeviceLoginResult;
  publishHome: PublishHome;
  userId: string;
}): Promise<void> {
  const current = polling.get(userId);
  if (current?.controller !== controller) {
    return;
  }
  const resolved = await completeLogin({ controller, login, userId });
  if (isCurrentLogin({ controller, userId })) {
    polling.delete(userId);
  }
  await publishHome(userId);
  if (!current.viewId || current.method !== 'app') {
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
  polling.get(userId)?.controller.abort();
  const controller = new AbortController();
  polling.set(userId, {
    controller,
    device: undefined,
    method: 'app',
    viewId: undefined,
  });
  // The trigger_id expires about 3 seconds after the click, so the modal opens
  // before the GitHub round trip for a device code, not after it.
  let viewId: string | undefined;
  try {
    const opened = await slack.webClient.views.open({
      trigger_id: triggerId,
      view: connectView({ device: undefined, loading: true, method: 'app' }),
    });
    viewId = opened.view?.id;
  } catch (error) {
    logger.error('[github] could not open the connect modal', {
      error,
      userId,
    });
    if (isCurrentLogin({ controller, userId })) {
      polling.delete(userId);
    }
    return;
  }
  const registered = polling.get(userId);
  if (registered?.controller === controller) {
    polling.set(userId, { ...registered, viewId });
  }

  let device: DeviceLogin;
  try {
    device = await startDeviceLogin();
  } catch (error) {
    logger.error('[github] could not start device login', { error, userId });
    const failed = polling.get(userId);
    if (failed?.controller !== controller) {
      return;
    }
    polling.delete(userId);
    if (viewId && failed.method === 'app') {
      await slack
        .updateModal(viewId, failedModal('unreachable'))
        .catch((updateError: unknown) =>
          logger.debug('[github] could not update the sign-in modal', {
            error: updateError,
            userId,
          })
        );
    }
    return;
  }

  const current = polling.get(userId);
  if (current?.controller !== controller) {
    return;
  }
  polling.set(userId, { ...current, device });
  if (viewId && current.method === 'app') {
    try {
      await slack.webClient.views.update({
        view_id: viewId,
        view: connectView({ device, method: 'app' }),
      });
    } catch (error) {
      logger.warn('[github] could not show the device code', {
        error,
        userId,
      });
    }
  }

  awaitDeviceLogin({ ...device, signal: controller.signal })
    .then((login) => settleLogin({ controller, login, publishHome, userId }))
    .catch((error: unknown) =>
      logger.error('[github] device login failed', { error, userId })
    );
}

async function switchMethod({
  method,
  userId,
  view,
}: {
  method: GitHubCredentialKind;
  userId: string;
  view: ViewTarget;
}): Promise<void> {
  const pending = polling.get(userId);
  if (pending) {
    polling.set(userId, { ...pending, method });
  }
  try {
    await slack.webClient.views.update({
      hash: view.hash,
      view_id: view.id,
      view: connectView({
        device: pending?.device,
        loading: Boolean(pending),
        method,
        warning: pending
          ? undefined
          : 'Gorkie restarted, so this code is stale. Press Cancel and start again, or paste a token below.',
      }),
    });
  } catch (error) {
    logger.warn('[github] could not switch the connect modal', {
      error,
      userId,
    });
  }
}

async function saveToken({
  publishHome,
  token,
  userId,
}: {
  publishHome: PublishHome;
  token: string;
  userId: string;
}): Promise<ModalResponse> {
  if (!token) {
    return { action: 'errors', errors: { token: 'Paste a token.' } };
  }
  const verified = await verifyGitHubPat(token);
  if ('error' in verified) {
    return { action: 'errors', errors: { token: verified.error } };
  }
  polling.get(userId)?.controller.abort();
  polling.delete(userId);
  await setGitHubCredential({
    credential: {
      ...verified,
      expiresAt: undefined,
      kind: 'pat',
      refreshToken: undefined,
    },
    userId,
  });
  await publishHome(userId);
  return { action: 'clear' };
}

async function finishDeviceLogin(userId: string): Promise<ModalResponse> {
  // A pending login outranks a stored credential: on Reconnect the old one is
  // still there until GitHub confirms the new code.
  if (polling.has(userId)) {
    return {
      action: 'errors',
      errors: {
        [ids.method]:
          'GitHub has not confirmed yet. Finish both steps, then press Done again.',
      },
    };
  }
  if (await getGitHubCredential(userId)) {
    return { action: 'clear' };
  }
  return { action: 'update', modal: failedModal('interrupted') };
}

export function registerConnect({
  publishHome,
}: {
  publishHome: PublishHome;
}): void {
  const bot = Chat.getSingleton();

  bot.onAction(ids.connect, (event) =>
    openConnect({
      publishHome,
      triggerId: event.triggerId ?? '',
      userId: event.user.userId,
    })
  );

  bot.onAction(ids.method, async (event) => {
    const { userId } = event.user;
    const stale = polling.get(userId)?.viewId;
    const view = viewOf(event.raw) ?? (stale ? { id: stale } : undefined);
    if (!view) {
      logger.warn('[github] a connect modal switched with no view id', {
        userId,
      });
      return;
    }
    await switchMethod({
      method: event.value === 'pat' ? 'pat' : 'app',
      userId,
      view,
    });
  });

  bot.onModalSubmit(ids.modal, async (event) => {
    const { userId } = event.user;
    const chosen = polling.get(userId)?.method ?? event.values[ids.method];
    // Only the signed-in and not-signed-in result modals lack the method select.
    if (!chosen) {
      return { action: 'clear' };
    }
    if (chosen === 'pat') {
      return await saveToken({
        publishHome,
        token: (event.values.token ?? '').trim(),
        userId,
      });
    }
    return await finishDeviceLogin(userId);
  });
}
