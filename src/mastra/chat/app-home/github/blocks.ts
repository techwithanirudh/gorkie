import { github as githubConfig } from '../../../config';
import { levelOutsideDM } from '../../../lib/approval';
import { oauthStartLink } from '../../../server/oauth-link';
import type {
  GitHubCredential,
  GitHubPermission,
  HomeSection,
} from '../../../types';
import { PRESETS } from '../presets';
import { ids } from './ids';

export function githubBlocks({
  credential,
  installations,
  permission,
  threads,
  unreadable,
  userId,
}: {
  credential: GitHubCredential | undefined;
  installations: number;
  permission: GitHubPermission;
  threads: boolean;
  unreadable: boolean;
  userId: string;
}): HomeSection {
  const signIn = oauthStartLink({ provider: 'github', slackUserId: userId });
  const scope = threads ? '  ·  `runs in shared threads`' : '';
  const threadLevel = levelOutsideDM({ isDM: false, level: permission });
  let access = `${PRESETS[permission].status}  ·  Gorkie uses your GitHub account${threads ? '' : ', in DMs only'}${scope}`;
  if (threads && threadLevel !== permission) {
    access = `${PRESETS[permission].status} in DMs  ·  ${PRESETS[threadLevel].status} in shared threads  ·  Gorkie uses your GitHub account`;
  }

  let status = 'Not connected';
  let detail = signIn
    ? 'Sign in with GitHub for access scoped to the repositories you pick.'
    : 'GitHub sign-in is not set up on this Gorkie yet.';
  if (unreadable) {
    status = '*Unavailable*';
    detail =
      'Gorkie could not read your stored connection, so GitHub tools will not run. Disconnect and sign in again to replace it.';
  } else if (credential?.lastError) {
    status = `*${credential.login}*  ·  :warning: needs reconnecting`;
    detail = credential.lastError;
  } else if (credential && installations > 0) {
    status = `*${credential.login}*`;
    detail = access;
  } else if (credential) {
    status = `*${credential.login}*`;
    detail = `Not installed on any repositories, so Gorkie cannot reach code${scope}  ·  <${githubConfig.installUrl}|choose repositories>`;
  }

  const connected = Boolean(credential) || unreadable;
  const connect = ({ label, primary }: { label: string; primary: boolean }) =>
    signIn
      ? [
          {
            type: 'button',
            text: { type: 'plain_text', text: label },
            action_id: ids.connect,
            url: signIn,
            ...(primary ? { style: 'primary' } : {}),
          },
        ]
      : [];

  const elements = connected
    ? [
        ...connect({
          label: 'Reconnect',
          primary: Boolean(credential?.lastError),
        }),
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
              text: "Gorkie forgets your sign-in, revokes it on GitHub, and stops using GitHub. The app stays installed on your repositories until you remove it in GitHub's settings.",
            },
            confirm: { type: 'plain_text', text: 'Disconnect' },
            deny: { type: 'plain_text', text: 'Cancel' },
          },
        },
      ]
    : connect({ label: 'Connect GitHub', primary: true });

  return {
    fixed: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*GitHub*\n${status}` },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: detail }],
      },
      ...(elements.length > 0 ? [{ type: 'actions', elements }] : []),
    ],
    trailing: [{ type: 'divider' }],
  };
}
