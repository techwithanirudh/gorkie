import type { ModalView, PlainTextOption } from '@slack/web-api';
import { CardText, Modal } from 'chat';
import { z } from 'zod';
import { setGitHubCredential } from '../../../db/queries/github';
import {
  type awaitDeviceLogin,
  type DeviceLogin,
  GITHUB_INSTALL_URL,
  githubUser,
  levelsFor,
} from '../../../lib/github';
import { logger } from '../../../lib/logger';
import type { GitHubPermission } from '../../../types';
import { PRESETS } from '../presets';
import { ids } from './ids';

function option({
  description,
  label,
  value,
}: {
  description: string;
  label: string;
  value: string;
}): PlainTextOption {
  return {
    text: { type: 'plain_text', text: label },
    description: { type: 'plain_text', text: description },
    value,
  };
}

export const polling = new Map<
  string,
  {
    controller: AbortController;
    device: DeviceLogin;
    method: ConnectMethod;
    viewId: string | undefined;
  }
>();

export type ConnectMethod = 'app' | 'pat';

const text = (body: string) => ({
  type: 'section' as const,
  text: { type: 'mrkdwn' as const, text: body },
});

const viewAction = z.object({
  view: z.object({ hash: z.string().optional(), id: z.string() }),
});

export interface ViewTarget {
  hash?: string;
  id: string;
}

// Slack rejects an update carrying a stale hash, which is what stops a
// concurrent action's render from being clobbered.
export function viewOf(raw: unknown): ViewTarget | undefined {
  return viewAction.safeParse(raw).data?.view;
}

const permissionState = z.object({
  view: z.object({
    state: z.object({
      values: z.record(
        z.string(),
        z.record(
          z.string(),
          z.looseObject({
            selected_option: z.object({ value: z.string() }).nullish(),
          })
        )
      ),
    }),
  }),
});

export function selectedPermission(raw: unknown): string | undefined {
  const values = permissionState.safeParse(raw).data?.view.state.values ?? {};
  for (const block of Object.values(values)) {
    const selected = block[ids.permission]?.selected_option?.value;
    if (selected) {
      return selected;
    }
  }
}

export function configureView({
  pat,
  permission,
  threads,
}: {
  pat: boolean;
  permission: GitHubPermission;
  threads: boolean;
}): ModalView {
  const permissions = levelsFor(threads).map((value) =>
    option({ ...PRESETS[value], value })
  );
  const scopes = [
    option({
      description:
        'In a shared thread Gorkie writes up the task and DMs it to you instead.',
      label: 'Only in a DM with you',
      value: 'dm',
    }),
    option({
      description:
        'Anyone in the thread can steer the work, and checked-out code stays readable there for as long as the thread lives.',
      label: 'Anywhere, including shared threads (dangerous)',
      value: 'threads',
    }),
  ];
  const selected =
    permissions.find((o) => o.value === permission) ??
    permissions.find((o) => o.value === 'write');
  return {
    type: 'modal',
    callback_id: ids.configureModal,
    title: { type: 'plain_text', text: 'Configure GitHub' },
    submit: { type: 'plain_text', text: 'Save' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: ids.scope,
        dispatch_action: true,
        label: { type: 'plain_text', text: 'Where can Gorkie use GitHub?' },
        element: {
          type: 'radio_buttons',
          action_id: ids.scope,
          options: scopes,
          initial_option: scopes.find(
            (o) => o.value === (threads ? 'threads' : 'dm')
          ),
        },
      },
      {
        type: 'input',
        block_id: `${ids.permission}_${threads ? 'threads' : 'dm'}`,
        label: { type: 'plain_text', text: 'When should Gorkie stop and ask?' },
        element: {
          type: 'radio_buttons',
          action_id: ids.permission,
          options: permissions,
          initial_option: selected,
        },
      },
      text(
        pat
          ? 'Your token reaches everything its scopes allow, not a list of repositories. Disconnect to go back to the app.'
          : 'Gorkie reaches only the repositories you chose. <https://github.com/settings/installations|Change which ones> on GitHub.'
      ),
    ],
  };
}

export function connectView({
  device,
  method,
  warning,
}: {
  device: DeviceLogin | undefined;
  method: ConnectMethod;
  warning?: string;
}): ModalView {
  const app = device
    ? [
        text(
          `*1.* <${GITHUB_INSTALL_URL}|Choose which repositories Gorkie may use>. Pick "Only select repositories" to keep it narrow.`
        ),
        text(
          `*2.* Open <${device.verificationUri}|${device.verificationUri}> and enter this code:`
        ),
        text(`\`${device.userCode}\``),
        text(
          'GitHub keeps these separate, so do both. This closes itself once GitHub confirms, and the code lasts 15 minutes.'
        ),
      ]
    : [text('Press Cancel and start again to get a code.')];
  const pat = [
    text(
      'An app only reaches repositories it was installed on, so it cannot fork or open a pull request against one somebody else owns. A classic token can.'
    ),
    text(
      'Pick the scope you want: <https://github.com/settings/tokens/new?scopes=public_repo&description=Gorkie|`public_repo`> covers public repositories, including other people\u2019s. <https://github.com/settings/tokens/new?scopes=repo&description=Gorkie|`repo`> adds your private ones, and is the only way Gorkie reaches private code while a token is set.'
    ),
    {
      type: 'input',
      block_id: 'token',
      optional: true,
      label: { type: 'plain_text', text: 'Token' },
      element: {
        type: 'plain_text_input',
        action_id: 'token',
        placeholder: { type: 'plain_text', text: 'ghp_…' },
        max_length: 255,
      },
    },
  ];
  const options: PlainTextOption[] = [
    option({
      description: 'Scoped to the repositories you pick, and expires.',
      label: 'GitHub App',
      value: 'app',
    }),
    option({
      description: 'Also reaches repositories somebody else owns.',
      label: 'Classic token',
      value: 'pat',
    }),
  ];
  return {
    type: 'modal',
    callback_id: ids.modal,
    title: { type: 'plain_text', text: 'Connect GitHub' },
    submit: { type: 'plain_text', text: 'Done' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      ...(warning ? [text(`:warning: ${warning}`)] : []),
      {
        type: 'input',
        block_id: ids.method,
        dispatch_action: true,
        label: { type: 'plain_text', text: 'How to connect' },
        element: {
          type: 'static_select',
          action_id: ids.method,
          options,
          initial_option: options.find((o) => o.value === method),
        },
      },
      ...(method === 'app' ? app : pat),
    ],
  };
}

export function failedModal(reason: string) {
  const explained =
    {
      expired_token: 'The code ran out before GitHub confirmed.',
      interrupted: 'Gorkie restarted while waiting, losing track of this code.',
    }[reason] ?? `GitHub stopped the sign-in: ${reason}.`;
  return Modal({
    callbackId: ids.modal,
    title: 'Not signed in',
    submitLabel: 'Done',
    closeLabel: 'Close',
    children: [
      CardText(`:warning: ${explained}`),
      CardText(
        'Press Reconnect for a new code, or pick Classic token there instead.'
      ),
    ],
  });
}

export function connectedModal(login: string) {
  return Modal({
    callbackId: ids.modal,
    title: 'Signed in',
    submitLabel: 'Done',
    closeLabel: 'Close',
    children: [
      CardText(`:white_check_mark: Signed in as *${login}*.`),
      CardText(
        'Gorkie now reaches the repositories you installed it on. The GitHub section shows that, and when it stops to ask.'
      ),
    ],
  });
}

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
