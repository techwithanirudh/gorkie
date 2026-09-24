import { Chat, Modal, TextInput } from 'chat';
import {
  getUserSettings,
  updateUserSettings,
} from '../../../db/queries/settings';
import { publishHome, refreshHome } from '../view';
import { ids } from './ids';

export function registerCustomInstructions(): void {
  const bot = Chat.getSingleton();

  bot.onAction(ids.edit, async (event) => {
    const { instructions } = await getUserSettings(event.user.userId);
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
    await updateUserSettings({
      set: { instructions: null },
      userId: event.user.userId,
    });
    await publishHome(event.user.userId);
  });

  bot.onModalSubmit(ids.modal, async (event) => {
    const instructions = event.values.instructions?.trim();
    await updateUserSettings({
      set: { instructions: instructions || null },
      userId: event.user.userId,
    });
    refreshHome(event.user.userId);
  });
}
