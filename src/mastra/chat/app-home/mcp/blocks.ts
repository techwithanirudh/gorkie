import type { MCPServerConfig } from '../../../types';
import type { HomeSection } from '../limit';
import { ids } from './ids';
import { presetStatus } from './presets';

export function mcpServersBlocks(
  servers: (MCPServerConfig & { lastError?: string })[]
): HomeSection {
  const header = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*MCP Servers*${servers.length > 0 ? ` (${servers.length})` : ''}`,
    },
    accessory: {
      type: 'button',
      text: { type: 'plain_text', text: 'Add' },
      action_id: ids.add,
    },
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
              text: 'None yet. Add one to give Gorkie extra tools, just for you.',
            },
          ],
        },
      ],
      trailing: [{ type: 'divider' }],
    };
  }

  return {
    fixed: [header],
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
            text: `${presetStatus(server.permission)}  \u00b7  \`${server.url}\``,
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
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Configure' },
            action_id: `${ids.configure} ${server.name}`,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Remove' },
            action_id: `${ids.remove} ${server.name}`,
            style: 'danger',
            confirm: {
              title: { type: 'plain_text', text: 'Remove server?' },
              text: {
                type: 'mrkdwn',
                text: `This removes *${server.name}* and its stored token.`,
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
