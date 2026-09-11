import { agent as agentConfig } from '../../../config';
import { chatChannelId } from '../../../lib/ids';
import { isAgentSchedule } from '../../../tools/scheduled-tasks/queries';
import { getMastra } from '../../mastra-instance';
import type { HomeSection } from '../limit';
import { ids } from './ids';

export async function scheduledTasksBlocks(
  userId: string
): Promise<HomeSection> {
  const schedules = await getMastra().schedules.list({
    agentId: agentConfig.id,
    resourceId: chatChannelId(userId),
  });
  const tasks = schedules.filter(isAgentSchedule);
  const header = {
    type: 'header',
    text: { type: 'plain_text', text: 'Scheduled Tasks' },
  };

  if (tasks.length === 0) {
    return {
      fixed: [
        header,
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '_No scheduled tasks yet. Ask Gorkie to set one up in any conversation._',
          },
        },
      ],
    };
  }

  return {
    fixed: [header],
    rows: tasks.map((task) => {
      const title =
        task.name ??
        (task.prompt.length > 60
          ? `${task.prompt.slice(0, 60)}\u2026`
          : task.prompt);
      const nextFire = Math.floor(task.nextFireAt / 1000);
      return [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${title}*\n\`${task.cron}\`${task.timezone ? ` (${task.timezone})` : ''} \u00b7 next run <!date^${nextFire}^{date_short_pretty} at {time}|soon>`,
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
        },
      ];
    }),
    overflow: (dropped) => ({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `_\u2026and ${dropped} more. Cancel one above to see the rest._`,
      },
    }),
    trailing: [{ type: 'divider' }],
  };
}
