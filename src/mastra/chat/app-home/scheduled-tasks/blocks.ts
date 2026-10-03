import { formatSlackDate } from '@chat-adapter/slack/format';
import { agent as agentConfig } from '../../../config';
import { isScheduledTask } from '../../../tools/scheduled-tasks/schedules';
import type { HomeSection } from '../../../types';
import { slack } from '../../client';
import { getMastra } from '../../mastra-instance';
import { ids } from './ids';

export async function scheduledTasksBlocks(
  userId: string
): Promise<HomeSection> {
  const schedules = await getMastra().schedules.list({
    agentId: agentConfig.id,
    resourceId: `${slack.name}:${userId}`,
  });
  const tasks = schedules.filter(isScheduledTask);
  const header = {
    type: 'section',
    text: { type: 'mrkdwn', text: '*Scheduled Tasks*' },
  };

  if (tasks.length === 0) {
    return {
      fixed: [
        header,
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: 'none yet. ask gorkie to schedule one for you in any conversation.',
            },
          ],
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
      const nextFire = formatSlackDate(
        new Date(task.nextFireAt),
        '{date_short_pretty} at {time}',
        'soon'
      );
      return [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${title}*\n\`${task.cron}\`${task.timezone ? ` (${task.timezone})` : ''} \u00b7 next run ${nextFire}`,
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
