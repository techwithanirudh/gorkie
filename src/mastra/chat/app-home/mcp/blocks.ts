import type { MCPServerConfig } from '../../../types';
import { heading, note } from '../blocks';
import type { HomeSection } from '../limit';
import { PRESETS } from '../presets';
import { ids } from './ids';

export function mcpServersBlocks(
  servers: (MCPServerConfig & { lastError?: string })[]
): HomeSection {
  const header = {
    ...heading('MCP Servers'),
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
        note(
          'None yet. Add a server to give Gorkie extra tools, just for you.'
        ),
      ],
      trailing: [{ type: 'divider' }],
    };
  }

  return {
    fixed: [header],
    rows: servers.map((server) => [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${server.name}*` },
      },
      note(`${PRESETS[server.permission].status}  ·  \`${server.url}\``),
      ...(server.lastError ? [note(`:warning: ${server.lastError}`)] : []),
      {
        type: 'actions',
        elements: [
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
                text: `This removes ${server.name} and its stored token.`,
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
