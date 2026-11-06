import { Chat } from 'chat';
import { isScheduledTask } from '../../../tools/scheduled-tasks/schedules';
import { slack } from '../../client';
import { getMastra } from '../../mastra-instance';
import { publishHome } from '../view';
import { ids } from './ids';

export function registerScheduledTasks(): void {
  Chat.getSingleton().onAction(ids.cancel, async (event) => {
    const id = event.value;
    if (!id) {
      return;
    }
    const mastra = getMastra();
    const schedule = await mastra.schedules.get(id);
    if (
      !(schedule && isScheduledTask(schedule)) ||
      schedule.resourceId !== `${slack.name}:${event.user.userId}`
    ) {
      return;
    }
    await mastra.schedules.delete(id);
    await publishHome(event.user.userId);
  });
}
