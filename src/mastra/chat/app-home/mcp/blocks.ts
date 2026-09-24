import { mcp } from '../../../config';
import { oauthStartLink } from '../../../server/oauth-link';
import type {
  HomeSection,
  MCPOAuthStatus,
  StoredMCPServer,
} from '../../../types';
import { PRESETS, SCOPE_LABELS, scopeSchema } from '../presets';
import { ids } from './ids';

const oauthStatus = {
  connected: 'signed in with OAuth',
  disconnected: 'not signed in',
  'needs-auth': 'sign-in expired',
} satisfies Record<MCPOAuthStatus, string>;

function oauthButtons({
  server,
  userId,
}: {
  server: StoredMCPServer;
  userId: string;
}) {
  if (!server.oauth) {
    return [];
  }
  const link = oauthStartLink({
    provider: 'mcp',
    slackUserId: userId,
    target: server.name,
  });
  const connected = server.oauth.status === 'connected';
  return [
    ...(link
      ? [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text:
                server.oauth.status === 'disconnected'
                  ? 'Connect'
                  : 'Reconnect',
            },
            action_id: ids.connect,
            url: link,
            ...(connected ? {} : { style: 'primary' }),
          },
        ]
      : []),
    ...(connected
      ? [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Disconnect' },
            action_id: ids.disconnect,
            value: server.name,
          },
        ]
      : []),
  ];
}

export function mcpServersBlocks({
  servers,
  threads,
  userId,
}: {
  servers: StoredMCPServer[];
  threads: boolean;
  userId: string;
}): HomeSection {
  const header = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*MCP Servers*${servers.length > 0 ? ` (${servers.length} of ${mcp.maxServers})` : ''}`,
    },
    ...(servers.length < mcp.maxServers && {
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Add' },
        action_id: ids.add,
      },
    }),
  };

  if (servers.length === 0) {
    return {
      fixed: [
        header,
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: 'none yet. add one to give gorkie extra tools, just for you.',
            },
          ],
        },
      ],
      trailing: [{ type: 'divider' }],
    };
  }

  const scopes = scopeSchema.unwrap().options.map((value) => ({
    text: { type: 'plain_text', text: SCOPE_LABELS[value] },
    description: {
      type: 'plain_text',
      text: {
        dm: 'Shared threads get none of these servers.',
        threads:
          'Anyone in the thread can steer them, and they always ask before writing there.',
      }[value],
    },
    value,
  }));

  return {
    fixed: [
      header,
      {
        type: 'actions',
        elements: [
          {
            type: 'radio_buttons',
            action_id: ids.threads,
            options: scopes,
            initial_option: scopes[threads ? 1 : 0],
          },
        ],
      },
    ],
    rows: servers.map((server, index) => [
      ...(index > 0 ? [{ type: 'divider' }] : []),
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${server.name}*` },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `${PRESETS[server.permission].status}${server.oauth ? `  \u00b7  ${oauthStatus[server.oauth.status]}` : ''}  \u00b7  \`${server.url}\``,
          },
        ],
      },
      ...(server.lastError
        ? [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Error*\n\`\`\`${server.lastError}\`\`\``,
              },
            },
          ]
        : []),
      {
        type: 'actions',
        elements: [
          ...oauthButtons({ server, userId }),
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Configure' },
            action_id: ids.configure,
            value: server.name,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Remove' },
            action_id: ids.remove,
            value: server.name,
            style: 'danger',
            confirm: {
              title: { type: 'plain_text', text: 'Remove server?' },
              text: {
                type: 'plain_text',
                text: `This removes ${server.name} and signs Gorkie out of it.`,
              },
              confirm: { type: 'plain_text', text: 'Remove' },
              deny: { type: 'plain_text', text: 'Keep' },
            },
          },
        ],
      },
    ]),
    overflow: (dropped) => ({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `_\u2026and ${dropped} more server${dropped === 1 ? '' : 's'}, hidden because the Home tab is full._`,
      },
    }),
    trailing: [{ type: 'divider' }],
  };
}
