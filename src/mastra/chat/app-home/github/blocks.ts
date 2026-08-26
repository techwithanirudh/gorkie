import type { GitHubCredential } from '../../../db/queries/github';
import { GITHUB_INSTALL_URL } from '../../../lib/github';
import type { GitHubPermission } from '../../../types';
import { ids } from './ids';
import { presetStatus } from './presets';

export function githubBlocks({
  credential,
  installations,
  permission,
  threads,
}: {
  credential: GitHubCredential | undefined;
  installations: number;
  permission: GitHubPermission;
  threads: boolean;
}): Record<string, unknown>[] {
  const login = credential?.kind === 'app' ? credential.login : undefined;
  const pat = credential?.kind === 'pat' ? credential : undefined;

  const scope = threads ? '  ·  `runs in shared threads`' : '';
  let status = 'Not connected';
  let detail =
    'Sign in with the app for access scoped to the repositories you pick. A classic token also reaches repositories somebody else owns.';
  if (credential?.kind === 'pat') {
    status = `*${credential.login}*`;
    detail = `${presetStatus(permission)}${scope}  ·  using your personal token`;
  } else if (credential && installations > 0) {
    status = `*${credential.login}*`;
    detail = `${presetStatus(permission)}${scope}  ·  Gorkie uses your GitHub account`;
  } else if (credential) {
    status = `*${credential.login}*`;
    detail = `Not installed on any repositories, so Gorkie cannot reach code  ·  <${GITHUB_INSTALL_URL}|choose repositories>`;
  }

  const connected = Boolean(credential);
  const forgets = [
    login ? 'your sign-in' : undefined,
    pat ? 'your token' : undefined,
  ]
    .filter(Boolean)
    .join(' and ');
  const afterwards = [
    login
      ? "The app stays installed on your repositories until you remove it in GitHub's settings."
      : undefined,
    pat
      ? 'The token itself keeps working until you delete it on GitHub.'
      : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*GitHub*\n${status}` },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: detail }],
    },
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
              text: { type: 'plain_text', text: 'Connect GitHub' },
              action_id: ids.connect,
              style: 'primary',
            },
          ],
    },
    { type: 'divider' },
  ];
}
