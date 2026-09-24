import type { AgentSchedule, AnySchedule } from '@mastra/core/schedules';
import type { ToolExecutionContext } from '@mastra/core/tools';
import { z } from 'zod';
import { agent as agentConfig } from '../../config';
import { channelContext } from '../../lib/context';
import { rawId } from '../../lib/ids';

const WAIT_SCHEDULE_KIND = 'wait';

export const waitMetadata = { kind: WAIT_SCHEDULE_KIND };

// Schedule hooks get the row as an untyped `ScheduleRef`, hence the parse.
export function isWaitSchedule(schedule: { metadata?: unknown }): boolean {
  return z
    .object({ kind: z.literal(WAIT_SCHEDULE_KIND) })
    .safeParse(schedule.metadata).success;
}

// Waits are one-shot agent schedules too, so without the kind check they
// would show up, and could be paused or deleted, as the user's tasks.
export function isScheduledTask(
  schedule: AnySchedule
): schedule is AgentSchedule {
  return schedule.agentId === agentConfig.id && !isWaitSchedule(schedule);
}

// A thread's memory resource is whoever started it, so in a shared thread
// anyone else talking would otherwise list, change, or add to that person's
// schedules, including their DM tasks.
export function ownResourceId(context: ToolExecutionContext): string {
  const resourceId = context.agent?.resourceId;
  const { userId } = channelContext(context.requestContext);
  if (!resourceId) {
    throw new Error('No current Slack resource for scheduled tasks.');
  }
  if (!userId || rawId(userId) !== rawId(resourceId)) {
    throw new Error(
      'Only the person who started this conversation can manage its scheduled tasks. Ask them, or start your own thread or DM.'
    );
  }
  return resourceId;
}
