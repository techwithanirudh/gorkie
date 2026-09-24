import { Chat, Modal, TextInput } from 'chat';
import { getInstructions, setInstructions } from '../../../db/queries/settings';
import type { PublishHome } from '../../../types';
import { ids } from './ids';

export function registerCustomInstructions({
  publishHome,
}: {
  publishHome: PublishHome;
}): void {
  const bot = Chat.getSingleton();

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
            label: 'How should Gorkie act for you?',
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
    // TODO(slopradar): review: performance | awaited publishHome inside a modal submit delays Slack's view_submission ack; publishHome calls GitHub (see mcp/actions.ts L83) | fire it without awaiting, with a why-comment
    await publishHome(event.user.userId);
  });
}
