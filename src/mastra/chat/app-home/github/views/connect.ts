import type { ModalView, PlainTextOption } from '@slack/web-api';
import { env } from '@/env';
import type { DeviceLogin, GitHubCredentialKind } from '../../../../types';
import { ids } from '../ids';
import { option, text } from './shared';

export const connectView = ({
  device,
  loading,
  method,
  warning,
}: {
  device: DeviceLogin | undefined;
  loading?: boolean;
  method: GitHubCredentialKind;
  warning?: string;
}): ModalView => {
  let app = [text('Press Cancel and start again to get a code.')];
  if (loading) {
    app = [text('Getting a sign-in code from GitHub...')];
  }
  if (device) {
    app = [
      text(
        `*1.* <https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new|Choose which repositories Gorkie may use>. Pick "Only select repositories" to keep it narrow.`
      ),
      text(
        `*2.* Open <${device.verificationUri}|${device.verificationUri}> and enter this code:`
      ),
      text(`\`${device.userCode}\``),
      text(
        'GitHub keeps these separate, so do both. This closes itself once GitHub confirms, and the code lasts 15 minutes.'
      ),
    ];
  }
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
};
