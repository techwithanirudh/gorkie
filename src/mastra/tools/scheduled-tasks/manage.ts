import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { input, output } from '../../types/tools/index';
import { ownedSchedule } from './queries';

const labels = {
  pause: {
    running: 'pausing a scheduled task',
    done: 'paused a scheduled task',
  },
  resume: {
    running: 'resuming a scheduled task',
    done: 'resumed a scheduled task',
  },
  delete: {
    running: 'deleting a scheduled task',
    done: 'deleted a scheduled task',
  },
};

export const manageScheduledTaskTool = createTool({
  id: 'manage_scheduled_task',
  transform: {
    display: {
      input: ({ input }) => ({
        summary: input?.action
          ? labels[input.action].running
          : 'managing a scheduled task',
      }),
      output: ({ output }) => ({
        summary: output ? labels[output.action].done : 'scheduled task updated',
      }),
    },
  },
  description:
    'Pause, resume, or permanently delete a recurring schedule in the current Slack conversation. Pausing keeps the schedule so it can be resumed later.',
  inputSchema: input({
    id: z.string().min(1).describe('Schedule ID.'),
    action: z.enum(['pause', 'resume', 'delete']),
  }),
  outputSchema: output({
    id: z.string(),
    action: z.enum(['pause', 'resume', 'delete']),
    schedule: z.unknown().optional(),
  }),
  execute: async ({ id, action }, context) => {
    const schedules = context.mastra?.schedules;
    const { resourceId } = context.agent ?? {};
    if (!(schedules && resourceId)) {
      throw new Error('A resourceId is required to manage a schedule.');
    }
    if (!(await ownedSchedule({ schedules, id, resourceId }))) {
      throw new Error(`Schedule ${id} was not found in this conversation.`);
    }
    if (action === 'delete') {
      await schedules.delete(id);
      return { id, action };
    }
    const schedule =
      action === 'pause'
        ? await schedules.pause(id)
        : await schedules.resume(id);
    return { id, action, schedule };
  },
});
