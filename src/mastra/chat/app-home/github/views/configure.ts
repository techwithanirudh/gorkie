import type { ModalView } from '@slack/web-api';
import { levelsFor } from '../../../../lib/github';
import type { GitHubPermission } from '../../../../types';
import { PRESETS } from '../../presets';
import { ids } from '../ids';
import { option, text } from './shared';

export const configureView = ({
  pat,
  permission,
  threads,
}: {
  pat: boolean;
  permission: GitHubPermission;
  threads: boolean;
}): ModalView => {
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
};
