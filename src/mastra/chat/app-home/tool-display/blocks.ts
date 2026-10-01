import type { HomeSection, ToolDisplayMode } from '../../../types';
import { ids } from './ids';

const options = [
  {
    value: 'default',
    text: 'Default',
    description: 'Only the typing status while gorkie works.',
  },
  {
    value: 'detailed',
    text: 'Detailed',
    description:
      'Each step as a card with its inputs and what it found; helper agents list their steps in one card.',
  },
] satisfies { value: ToolDisplayMode; text: string; description: string }[];

export function toolDisplayBlocks(mode: ToolDisplayMode): HomeSection {
  const radio = options.map((option) => ({
    text: { type: 'plain_text', text: option.text },
    description: { type: 'plain_text', text: option.description },
    value: option.value,
  }));
  return {
    fixed: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Tool Display*\nhow gorkie shows its work when it answers you.',
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'radio_buttons',
            action_id: ids.mode,
            options: radio,
            initial_option: radio.find((option) => option.value === mode),
          },
        ],
      },
    ],
    trailing: [{ type: 'divider' }],
  };
}
