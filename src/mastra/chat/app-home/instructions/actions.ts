import { Modal, TextInput } from 'chat';
import { getInstructions, setInstructions } from '../../../db/queries/settings';
import { chat } from '../../instance';
import { guarded } from '../../moderation/gate';
import { ids } from './ids';

export function registerCustomInstructions({
  publishHome,
}: {
  publishHome: (userId: string) => Promise<void>;
}): void {
  const bot = chat();

  bot.onAction(
    ids.edit,
    guarded(async (event) => {
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
    })
  );

  bot.onAction(
    ids.clear,
    guarded(async (event) => {
      await setInstructions({
        userId: event.user.userId,
        instructions: undefined,
      });
      await publishHome(event.user.userId);
    })
  );

  bot.onModalSubmit(
    ids.modal,
    guarded(async (event) => {
      const instructions = event.values.instructions?.trim();
      await setInstructions({
        userId: event.user.userId,
        instructions: instructions || undefined,
      });
      await publishHome(event.user.userId);
    })
  );
}
