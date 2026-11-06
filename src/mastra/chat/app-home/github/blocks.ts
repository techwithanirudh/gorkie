import { env } from '@/env';
import type { GitHubCredential, GitHubPermission } from '../../../types';
import { heading, note } from '../blocks';
import type { HomeSection } from '../limit';
import { PRESETS } from '../presets';
import { ids } from './ids';

export function githubBlocks({
  credential,
  installations,
  permission,
  threads,
  unreadable,
}: {
  credential: GitHubCredential | undefined;
  installations: number | undefined;
  permission: GitHubPermission;
  threads: boolean;
  unreadable: boolean;
}): HomeSection {
  const scope = threads ? '  ·  `runs in shared threads`' : '';
  let status = 'Not connected';
  let detail =
    'Sign in with the app for access scoped to the repositories you pick.';
  if (unreadable) {
    status = 'Unavailable';
    detail =
      'Gorkie could not read your stored connection, so GitHub tools will not run. Disconnect and sign in again to replace it.';
  } else if (credential && installations === undefined) {
    status = `Connected as *${credential.login}*`;
    detail = `${PRESETS[permission].status}${scope}  ·  Gorkie could not check which repositories it can reach just now`;
  } else if (credential && installations) {
    status = `Connected as *${credential.login}*`;
    detail = `${PRESETS[permission].status}${scope}  ·  Gorkie uses your GitHub account`;
  } else if (credential) {
    status = `Connected as *${credential.login}*`;
    detail = `Not installed on any repositories, so Gorkie cannot reach code${scope}  ·  <${`https://github.com/apps/${env.GITHUB_APP_SLUG}/installations/new`}|choose repositories>`;
  }

  const connected = Boolean(credential) || unreadable;
  const forgets = 'your sign-in';
  const afterwards =
    "The app stays installed on your repositories until you remove it in GitHub's settings.";

  return {
    fixed: [
      heading('GitHub'),
      note(`${status}. ${detail}`),
      {
        type: 'actions',
        elements: connected
          ? [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Reconnect' },
                action_id: ids.connect,
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Configure' },
                action_id: ids.configure,
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Disconnect' },
                action_id: ids.disconnect,
                style: 'danger',
                confirm: {
                  title: { type: 'plain_text', text: 'Disconnect GitHub?' },
                  text: {
                    type: 'mrkdwn',
                    text: `Gorkie forgets ${forgets} and stops using GitHub. ${afterwards}`,
                  },
                  confirm: { type: 'plain_text', text: 'Disconnect' },
                  deny: { type: 'plain_text', text: 'Cancel' },
                },
              },
            ]
          : [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Connect' },
                action_id: ids.connect,
              },
            ],
      },
    ],
    trailing: [{ type: 'divider' }],
  };
}
