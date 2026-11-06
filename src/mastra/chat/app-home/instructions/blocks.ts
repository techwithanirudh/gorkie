import type { HomeSection } from '../../../types';
import { ids } from './ids';

export function customInstructionsBlocks(
  instructions: string | undefined
): HomeSection {
  const preview =
    instructions && instructions.length > 120
      ? `${instructions.slice(0, 120)}\u2026`
      : instructions;

  return {
    fixed: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*Custom Instructions*' },
      },
      preview
        ? {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `>${preview.replaceAll('\n', '\n>')}`,
            },
          }
        : {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: 'none yet. gorkie uses its default personality. add one to shape how it replies to you.',
              },
            ],
          },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: instructions ? 'Edit' : 'Add' },
            action_id: ids.edit,
          },
          ...(instructions
            ? [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'Clear' },
                  action_id: ids.clear,
                  style: 'danger',
                  confirm: {
                    title: { type: 'plain_text', text: 'Clear instructions?' },
                    text: {
                      type: 'mrkdwn',
                      text: 'This removes your custom instructions. Gorkie goes back to its default personality for you.',
                    },
                    confirm: { type: 'plain_text', text: 'Clear' },
                    deny: { type: 'plain_text', text: 'Cancel' },
                  },
                },
              ]
            : []),
        ],
      },
    ],
    trailing: [{ type: 'divider' }],
  };
}
