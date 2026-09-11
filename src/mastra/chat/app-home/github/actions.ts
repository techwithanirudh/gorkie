import {
  getGitHubCredential,
  setGitHubCredential,
} from '../../../db/queries/github';
import {
  awaitDeviceLogin,
  type DeviceLogin,
  githubUser,
  startDeviceLogin,
  verifyGitHubPat,
} from '../../../lib/github';
import { logger } from '../../../lib/logger';
import { slack } from '../../client';
import { chat } from '../../instance';
import { ids } from './ids';
import {
  type ConnectMethod,
  connectedModal,
  connectView,
  failedModal,
  type ViewTarget,
  viewOf,
} from './views';

export const polling = new Map<
  string,
  {
    controller: AbortController;
    device: DeviceLogin;
    method: ConnectMethod;
    viewId: string | undefined;
  }
>();

export async function completeLogin({
  login,
  userId,
}: {
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
  await setGitHubCredential({
    credential: { ...login, kind: 'app', login: resolved.login, scopes: [] },
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
  const resolved = await completeLogin({ login, userId });
  polling.delete(userId);
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
  let device: DeviceLogin;
  try {
    device = await startDeviceLogin();
  } catch (error) {
    logger.error('[github] could not start device login', { error, userId });
    return;
  }

  polling.get(userId)?.controller.abort();
  const controller = new AbortController();
  let opened: Awaited<ReturnType<typeof slack.webClient.views.open>>;
  try {
    opened = await slack.webClient.views.open({
      trigger_id: triggerId,
      view: connectView({ device, method: 'app' }),
    });
  } catch (error) {
    logger.error('[github] could not open the connect modal', {
      error,
      userId,
    });
    return;
  }
  polling.set(userId, {
    controller,
    device,
    method: 'app',
    viewId: opened.view?.id,
  });

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
  method: ConnectMethod;
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
}) {
  if (!token) {
    return { action: 'errors' as const, errors: { token: 'Paste a token.' } };
  }
  const verified = await verifyGitHubPat(token);
  if ('error' in verified) {
    return { action: 'errors' as const, errors: { token: verified.error } };
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
  return { action: 'clear' as const };
}

async function finishDeviceLogin({
  userId,
  view,
}: {
  userId: string;
  view: ViewTarget;
}) {
  const account = await getGitHubCredential(userId);
  if (account) {
    polling.get(userId)?.controller.abort();
    polling.delete(userId);
    return { action: 'clear' as const };
  }
  const pending = polling.get(userId);
  if (!pending?.device) {
    return { action: 'update' as const, modal: failedModal('interrupted') };
  }
  await slack.webClient.views.update({
    hash: view.hash,
    view_id: view.id,
    view: connectView({
      device: pending.device,
      method: pending.method,
      warning:
        'GitHub has not confirmed yet. Finish both steps, then press Done again.',
    }),
  });
}

export function registerConnect({
  publishHome,
}: {
  publishHome: PublishHome;
}): void {
  const bot = chat();

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
    // The remembered id carries no hash, so that update stays unguarded.
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
    if (`${chosen}` === 'pat') {
      return await saveToken({
        publishHome,
        token: `${event.values.token ?? ''}`.trim(),
        userId,
      });
    }
    return await finishDeviceLogin({
      userId,
      view: viewOf(event.raw) ?? { id: event.viewId },
    });
  });
}
