import { agent as agentConfig } from '../../config';
import { chatChannelId } from '../../lib/ids';
import { isAgentSchedule } from '../../tools/scheduled-tasks/queries';
import { chat } from '../instance';
import { getMastra } from '../mastra-instance';

const ids = {
  cancel: 'app_home_cancel_task',
};

export async function scheduledTasksBlocks(
  userId: string,
  maxBlocks: number
): Promise<Record<string, unknown>[]> {
  const schedules = await getMastra().schedules.list({
    agentId: agentConfig.id,
    resourceId: chatChannelId(userId),
  });
  const tasks = schedules.filter(isAgentSchedule);

  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Scheduled Tasks' },
    },
  ];

  if (tasks.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '_No scheduled tasks yet. Ask gorkie to set one up in any conversation._',
      },
    });
    return blocks;
  }

  // Slack's Home view caps out at 100 blocks total. Leave room for the
  // header and trailing divider already counted here, plus one more slot
  // for an overflow notice if not every task fits.
  const available = Math.max(0, maxBlocks - 2);
  const overflow = Math.max(0, tasks.length - available);
  const shown =
    overflow > 0 ? tasks.slice(0, Math.max(0, available - 1)) : tasks;

  for (const task of shown) {
    const title =
      task.name ??
      (task.prompt.length > 60 ? `${task.prompt.slice(0, 60)}…` : task.prompt);
    const nextFire = Math.floor(task.nextFireAt / 1000);
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${title}*\n\`${task.cron}\`${task.timezone ? ` (${task.timezone})` : ''} · next run <!date^${nextFire}^{date_short_pretty} at {time}|soon>`,
      },
      accessory: {
        type: 'button',
        text: { type: 'plain_text', text: 'Cancel' },
        action_id: ids.cancel,
        value: task.id,
        style: 'danger',
        confirm: {
          title: { type: 'plain_text', text: 'Cancel this task?' },
          text: {
            type: 'mrkdwn',
            text: `This permanently deletes "${title}".`,
          },
          confirm: { type: 'plain_text', text: 'Cancel task' },
          deny: { type: 'plain_text', text: 'Keep it' },
        },
      },
    });
  }
  if (overflow > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `_...and ${overflow} more. Cancel a task above to make room to see the rest._`,
      },
    });
  }
  blocks.push({ type: 'divider' });
  return blocks;
}

export function registerScheduledTasks({
  publishHome,
}: {
  publishHome: (userId: string) => Promise<void>;
}): void {
  chat().onAction(ids.cancel, async (event) => {
    const id = event.value;
    if (!id) {
      return;
    }
    const mastra = getMastra();
    const schedule = await mastra.schedules.get(id);
    const resourceId = chatChannelId(event.user.userId);
    if (
      !(schedule && isAgentSchedule(schedule)) ||
      schedule.agentId !== agentConfig.id ||
      schedule.resourceId !== resourceId
    ) {
      return;
    }
    await mastra.schedules.delete(id);
    await publishHome(event.user.userId);
  });
}
