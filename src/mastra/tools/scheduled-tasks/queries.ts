import type { AgentSchedule, AnySchedule } from '@mastra/core/schedules';
import { z } from 'zod';
import { agent as agentConfig } from '../../config';
import { WAIT_SCHEDULE_KIND } from '../../types';

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
