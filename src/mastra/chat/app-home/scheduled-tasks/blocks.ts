import { agent as agentConfig } from '../../../config';
import { chatChannelId } from '../../../lib/ids';
import { isAgentSchedule } from '../../../tools/scheduled-tasks/queries';
import { getMastra } from '../../mastra-instance';
import { ids } from './ids';

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
        text: '_No scheduled tasks yet. Ask Gorkie to set one up in any conversation._',
      },
    });
    return blocks;
  }

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
        text: `_…and ${overflow} more. Cancel one above to see the rest._`,
      },
    });
  }
  blocks.push({ type: 'divider' });
  return blocks;
}
