import { Chat } from 'chat';
import { setToolDisplay } from '../../../db/queries/settings';
import { toolDisplayModeSchema } from '../../../types';
import { publishHome } from '../view';
import { ids } from './ids';

export function registerToolDisplay(): void {
  Chat.getSingleton().onAction(ids.mode, async (event) => {
    const parsed = toolDisplayModeSchema.safeParse(event.value);
    if (!parsed.success) {
      return;
    }
    await setToolDisplay({
      toolDisplay: parsed.data,
      userId: event.user.userId,
    });
    await publishHome(event.user.userId);
  });
}
