import type { AgentSchedule, AnySchedule } from '@mastra/core/schedules';
import { agent as agentConfig } from '../../config';
import { WAIT_SCHEDULE_KIND } from '../../types';

export const waitMetadata = { kind: WAIT_SCHEDULE_KIND };

export function isWaitSchedule(schedule: AnySchedule): boolean {
  return schedule.metadata?.kind === WAIT_SCHEDULE_KIND;
}

// Waits are one-shot agent schedules too, so without the kind check they
// would show up, and could be paused or deleted, as the user's tasks.
export function isScheduledTask(
  schedule: AnySchedule
): schedule is AgentSchedule {
  return schedule.agentId === agentConfig.id && !isWaitSchedule(schedule);
}
