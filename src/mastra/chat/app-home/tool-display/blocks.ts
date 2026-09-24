import type { HomeSection, ToolDisplayMode } from '../../../types';
import { ids } from './ids';

const options = [
  {
    value: 'hidden',
    text: 'Hidden',
    description: 'Only the typing status while gorkie works.',
  },
  {
    value: 'compact',
    text: 'Compact',
    description: 'One live checklist of tool calls per reply.',
  },
  {
    value: 'detailed',
    text: 'Detailed',
    description: 'Each step as a card with what it found.',
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
          text: '*Tool Display*\nhow gorkie shows its work when it answers you. `!display` changes it for a single thread.',
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
