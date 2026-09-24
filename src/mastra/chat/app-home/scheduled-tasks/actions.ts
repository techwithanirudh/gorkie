import { Chat } from 'chat';
import { chatChannelId } from '../../../lib/ids';
import { isScheduledTask } from '../../../tools/scheduled-tasks/queries';
import type { PublishHome } from '../../../types';
import { getMastra } from '../../mastra-instance';
import { ids } from './ids';

export function registerScheduledTasks({
  publishHome,
}: {
  publishHome: PublishHome;
}): void {
  Chat.getSingleton().onAction(ids.cancel, async (event) => {
    const id = event.value;
    if (!id) {
      return;
    }
    const mastra = getMastra();
    const schedule = await mastra.schedules.get(id);
    const resourceId = chatChannelId(event.user.userId);
    if (
      !(schedule && isScheduledTask(schedule)) ||
      schedule.resourceId !== resourceId
    ) {
      return;
    }
    await mastra.schedules.delete(id);
    await publishHome(event.user.userId);
  });
}
