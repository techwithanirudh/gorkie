import { Modal, TextInput } from 'chat';
import { getInstructions, setInstructions } from '../../db/queries/settings';
import { chat } from '../instance';

const ids = {
  clear: 'app_home_clear_instructions',
  edit: 'app_home_edit_instructions',
  modal: 'app_home_instructions_modal',
};

export function customInstructionsBlocks(
  instructions: string | undefined
): Record<string, unknown>[] {
  const preview =
    instructions && instructions.length > 120
      ? `${instructions.slice(0, 120)}…`
      : instructions;

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Custom Instructions' },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: preview
          ? `>${preview.replaceAll('\n', '\n>')}`
          : '_No custom instructions set. gorkie uses its default personality._',
      },
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
                    text: 'This removes your custom instructions. gorkie goes back to its default personality for you.',
                  },
                  confirm: { type: 'plain_text', text: 'Clear' },
                  deny: { type: 'plain_text', text: 'Cancel' },
                },
              },
            ]
          : []),
      ],
    },
    { type: 'divider' },
  ];
}

export function registerCustomInstructions({
  publishHome,
}: {
  publishHome: (userId: string) => Promise<void>;
}): void {
  const bot = chat();

  bot.onAction(ids.edit, async (event) => {
    const instructions = await getInstructions(event.user.userId);
    await event.openModal(
      Modal({
        callbackId: ids.modal,
        title: 'Custom Instructions',
        submitLabel: 'Save',
        children: [
          TextInput({
            id: 'instructions',
            label: 'How should gorkie act for you?',
            placeholder:
              'e.g. keep replies short, always show code diffs, address me as vro',
            multiline: true,
            initialValue: instructions,
            maxLength: 2000,
          }),
        ],
      })
    );
  });

  bot.onAction(ids.clear, async (event) => {
    await setInstructions({
      userId: event.user.userId,
      instructions: undefined,
    });
    await publishHome(event.user.userId);
  });

  bot.onModalSubmit(ids.modal, async (event) => {
    const instructions = event.values.instructions?.trim();
    await setInstructions({
      userId: event.user.userId,
      instructions: instructions || undefined,
    });
    await publishHome(event.user.userId);
  });
}
